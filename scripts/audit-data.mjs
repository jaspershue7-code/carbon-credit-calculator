// Cross-checks the CarbonPlan and Berkeley data for Tradewater and prints discrepancies.
// Usage: node scripts/audit-data.mjs <CarbonPlan csv folder> <Berkeley xlsx>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [cpDir, xlsx] = process.argv.slice(2);
if (!cpDir || !xlsx) { console.error('Usage: node scripts/audit-data.mjs <CarbonPlan csv folder> <Berkeley xlsx>'); process.exit(1); }

/* ---------- loaders ---------- */
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return rows.filter(r => r.length === h.length).map(r => Object.fromEntries(h.map((x, i) => [x, r[i]])));
}
const projects = parseCsv(fs.readFileSync(path.join(cpDir, 'projects.csv'), 'utf8'));
const credits = parseCsv(fs.readFileSync(path.join(cpDir, 'credits.csv'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(cpDir, 'metadata.json'), 'utf8'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
const tarBin = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tarBin, ['-xf', path.resolve(xlsx), '-C', tmp, 'xl/sharedStrings.xml', 'xl/worksheets/sheet2.xml']);
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const ss = [...fs.readFileSync(path.join(tmp, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
const brows = [];
for (const m of fs.readFileSync(path.join(tmp, 'xl/worksheets/sheet2.xml'), 'utf8').matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
  const o = {};
  for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = /t="(\w+)"/.exec(c[2]); const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '');
    if (v) o[c[1]] = (t && t[1] === 's') ? ss[+v[1]] : dec(v[1]);
  }
  brows.push(o);
}
fs.rmSync(tmp, { recursive: true, force: true });
const hi = brows.findIndex(r => r.A === 'Project ID');
const bAll = brows.slice(hi + 1).filter(r => r.A);

const num = v => parseFloat(v) || 0;
const fmt = n => Math.round(n).toLocaleString('en-US');
const flags = [];
const flag = (sev, msg) => flags.push([sev, msg]);
const head = t => console.log('\n=== ' + t);

/* ---------- selection ---------- */
const isTW = s => /tradewater/i.test(s || '');
const normId = id => id.replace(/^([A-Za-z]+)0+(\d)/, '$1$2').toUpperCase();   // ACR0350 -> ACR350
const hereDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const extraIds = new Set(JSON.parse(fs.readFileSync(path.join(hereDir, 'extra-tradewater-projects.json'), 'utf8')).map(normId));
const cpTW = projects.filter(p => isTW(p.name) || isTW(p.proponent) || extraIds.has(normId(p.project_id)));
const bTW = bAll.filter(r => ['B', 'O', 'DM', 'DN', 'DO'].some(k => isTW(r[k])));
console.log(`(Projects added by scripts/extra-tradewater-projects.json: ${[...extraIds].join(', ') || 'none'})`);
const cpById = new Map(cpTW.map(p => [normId(p.project_id), p]));
const bById = new Map(bTW.map(r => [normId(r.A), r]));

head('A. Which projects are Tradewater (CarbonPlan vs Berkeley)');
console.log(`CarbonPlan ${cpTW.length}, Berkeley ${bTW.length}`);
const onlyB = [...bById.keys()].filter(k => !cpById.has(k));
const onlyC = [...cpById.keys()].filter(k => !bById.has(k));
console.log('Only in Berkeley:', onlyB.length);
for (const k of onlyB) {
  const r = bById.get(k); const cp = projects.find(p => normId(p.project_id) === k);
  console.log(`  ${r.A} "${r.B}" dev="${r.O}" owner="${r.DM || ''}" operator="${r.DN || ''}" issued=${fmt(num(r.P))} retired=${fmt(num(r.Q))} | in CarbonPlan at all: ${cp ? `yes (proponent="${cp.proponent}", name="${cp.name}")` : 'no'}`);
  if (!cp) flag('info', `${r.A} is in Berkeley but not in CarbonPlan's database at all (newer data or different coverage)`);
  else flag('warn', `${r.A} is Tradewater in Berkeley but CarbonPlan's name/proponent does not say Tradewater, so the buyer pages miss it`);
}
console.log('Only in CarbonPlan:', onlyC.length);
for (const k of onlyC) {
  const p = cpById.get(k); const r = bAll.find(x => normId(x.A) === k);
  console.log(`  ${p.project_id} "${p.name}" proponent="${p.proponent}" | in Berkeley at all: ${r ? `yes (developer="${r.O}", owner="${r.DM || ''}")` : 'no'}`);
  flag('warn', `${p.project_id} is Tradewater in CarbonPlan but not matched in Berkeley`);
}
console.log('Distinct Tradewater name/developer strings (Berkeley):', [...new Set(bTW.flatMap(r => ['O', 'DM', 'DN', 'DO'].map(k => r[k]).filter(isTW)))]);
// Possible misses: Tradewater mentioned in notes/description of non-matched projects
const maybe = bAll.filter(r => !bById.has(normId(r.A)) && ['FI', 'FJ', 'FK'].some(k => isTW(r[k])));
console.log(`Berkeley projects NOT matched but mentioning Tradewater in description or notes: ${maybe.length}`);
maybe.slice(0, 10).forEach(r => console.log(`  ${r.A} "${r.B}" dev="${r.O}"`));
if (maybe.length) flag('warn', `${maybe.length} Berkeley projects mention Tradewater in notes but were not matched; review them`);

head('B. Per-project issued and retired: CarbonPlan vs Berkeley');
let diffs = 0, sumC = { i: 0, r: 0 }, sumB = { i: 0, r: 0 };
const rowsB = [];
for (const [k, p] of cpById) {
  const r = bById.get(k); if (!r) continue;
  const ci = num(p.issued), cr = num(p.retired), bi = num(r.P), br = num(r.Q);
  sumC.i += ci; sumC.r += cr; sumB.i += bi; sumB.r += br;
  if (Math.abs(ci - bi) > 0.5 || Math.abs(cr - br) > 0.5) { diffs++; rowsB.push([p.project_id, ci, bi, bi - ci, cr, br, br - cr]); }
}
console.log(`Matched projects: ${[...cpById.keys()].filter(k => bById.has(k)).length}; with different issued or retired: ${diffs}`);
console.log(`Totals on matched projects: CarbonPlan issued ${fmt(sumC.i)} retired ${fmt(sumC.r)} | Berkeley issued ${fmt(sumB.i)} retired ${fmt(sumB.r)}`);
rowsB.sort((a, z) => Math.abs(z[6]) - Math.abs(a[6]));
console.log('id | CP issued | BK issued | diff | CP retired | BK retired | diff');
rowsB.slice(0, 15).forEach(r => console.log(r.map((x, i) => i ? fmt(x) : x).join(' | ')));
if (diffs) flag('warn', `${diffs} matched projects have different issued or retired totals between sources (snapshot dates differ: CarbonPlan ${meta.generated_at.slice(0, 10)} vs Berkeley 2026-08-31)`);

head('C. CarbonPlan internal consistency (Tradewater projects)');
const twIds = new Set(cpTW.map(p => p.project_id));
const tc = credits.filter(c => twIds.has(c.project_id));
const iss = {}, ret = {}, can = {};
for (const c of tc) {
  const m = c.transaction_type === 'issuance' ? iss : c.transaction_type === 'retirement' ? ret : can;
  m[c.project_id] = (m[c.project_id] || 0) + num(c.quantity);
}
let bad = 0;
for (const p of cpTW) {
  const id = p.project_id;
  const di = (iss[id] || 0) - num(p.issued), dr = (ret[id] || 0) - num(p.retired), dr2 = (ret[id] || 0) + (can[id] || 0) - num(p.retired);
  if (Math.abs(di) > 0.5 || (Math.abs(dr) > 0.5 && Math.abs(dr2) > 0.5)) {
    bad++; if (bad <= 8) console.log(`  ${id}: issuance rows ${fmt(iss[id] || 0)} vs projects.csv ${fmt(num(p.issued))}; retirement rows ${fmt(ret[id] || 0)} (+cancel ${fmt(can[id] || 0)}) vs ${fmt(num(p.retired))}`);
  }
  if (num(p.retired) > num(p.issued) + 0.5) { flag('warn', `${id} retired > issued in projects.csv`); console.log(`  ${id}: retired ${fmt(num(p.retired))} > issued ${fmt(num(p.issued))}`); }
}
console.log(`Projects where credits.csv rows do not add up to projects.csv: ${bad} of ${cpTW.length}`);
if (bad) flag('warn', `${bad} CarbonPlan projects: credit rows do not sum to the project totals`);
const cancelRows = tc.filter(c => c.transaction_type === 'cancellation');
console.log(`Cancellation rows on Tradewater projects: ${cancelRows.length} (qty ${fmt(cancelRows.reduce((s, c) => s + num(c.quantity), 0))}); the site ignores cancellations`);
const retTotal = tc.filter(c => c.transaction_type === 'retirement').reduce((s, c) => s + num(c.quantity), 0);
console.log(`Retirement rows total ${fmt(retTotal)} vs projects.csv retired total ${fmt(cpTW.reduce((s, p) => s + num(p.retired), 0))}`);
const dup = new Map();
for (const c of tc) { const k = [c.project_id, c.quantity, c.transaction_date, c.transaction_type, c.vintage, c.retirement_account, c.retirement_beneficiary, c.retirement_note].join('|'); dup.set(k, (dup.get(k) || 0) + 1); }
const dupGroups = [...dup.values()].filter(n => n > 1);
console.log(`Identical credit rows repeated: ${dupGroups.length} groups (${dupGroups.reduce((a, b) => a + b - 1, 0)} extra rows). Could be real batches or duplicates.`);
const badQty = tc.filter(c => !(num(c.quantity) > 0));
console.log(`Rows with zero or negative quantity: ${badQty.length}`);
if (badQty.length) flag('warn', `${badQty.length} Tradewater credit rows with zero/negative quantity`);
const snap = meta.generated_at.slice(0, 10);
const future = tc.filter(c => (c.transaction_date || '').slice(0, 10) > snap);
console.log(`Rows dated after the snapshot (${snap}): ${future.length}`);
const noDate = tc.filter(c => !c.transaction_date);
console.log(`Rows with no date: ${noDate.length} (qty ${fmt(noDate.reduce((s, c) => s + num(c.quantity), 0))})`);
if (noDate.length) flag('info', `${noDate.length} Tradewater credit rows have no date; they are in totals but not in year charts`);
const early = tc.filter(c => c.transaction_type === 'retirement' && c.vintage && (c.transaction_date || '').slice(0, 4) < c.vintage);
console.log(`Retirements dated before their vintage year: ${early.length}`);
const firstIss = {};
for (const c of tc.filter(c => c.transaction_type === 'issuance' && c.transaction_date)) firstIss[c.project_id] = !firstIss[c.project_id] || c.transaction_date < firstIss[c.project_id] ? c.transaction_date : firstIss[c.project_id];
const beforeIssue = tc.filter(c => c.transaction_type === 'retirement' && firstIss[c.project_id] && c.transaction_date && c.transaction_date < firstIss[c.project_id]);
console.log(`Retirements dated before the project's first issuance: ${beforeIssue.length}`);
if (beforeIssue.length) flag('warn', `${beforeIssue.length} retirements happen before the project's first issuance date`);

head('D. Berkeley internal consistency (Tradewater projects)');
const col = (start, n) => { const toN = s => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0); const toS = k => { let s = ''; while (k > 0) { s = String.fromCharCode(65 + (k - 1) % 26) + s; k = Math.floor((k - 1) / 26); } return s; }; return Array.from({ length: 31 }, (_, i) => toS(toN(start) + i)); };
const VC = col('X'), RC = col('BC'), MC = col('CH');
let c1 = 0, c2 = 0, c3 = 0, neg = 0;
for (const r of bTW) {
  const sv = VC.reduce((s, k) => s + num(r[k]), 0), sr = RC.reduce((s, k) => s + num(r[k]), 0), sm = MC.reduce((s, k) => s + num(r[k]), 0);
  if (Math.abs(sv - num(r.P)) > 1) { c1++; if (c1 <= 3) console.log(`  ${r.A}: vintage columns sum ${fmt(sv)} vs total issued ${fmt(num(r.P))}`); }
  if (Math.abs(sr - num(r.Q)) > 1) { c2++; if (c2 <= 3) console.log(`  ${r.A}: retired-by-year sum ${fmt(sr)} vs total retired ${fmt(num(r.Q))}`); }
  if (Math.abs(num(r.P) - num(r.Q) - num(r.R)) > 1) { c3++; if (c3 <= 3) console.log(`  ${r.A}: issued-retired ${fmt(num(r.P) - num(r.Q))} vs remaining ${fmt(num(r.R))}`); }
  if (MC.some(k => num(r[k]) < 0) || num(r.R) < 0) neg++;
}
console.log(`Vintage columns != total issued: ${c1}; retired-by-year != total retired: ${c2}; issued - retired != remaining: ${c3}; negative remaining: ${neg} (of ${bTW.length})`);
if (c1 || c2 || c3) flag('warn', `Berkeley internal mismatches: vintage ${c1}, retired-by-year ${c2}, remaining ${c3}`);
if (neg) flag('info', `${neg} Berkeley projects have negative remaining credits in some vintage (Berkeley documents this as small registry discrepancies)`);
const st = {}; bTW.forEach(r => st[r.E || '(blank)'] = (st[r.E || '(blank)'] || 0) + 1); console.log('Status values:', st);
const inactive = bTW.filter(r => /inactive|withdrawn/i.test(r.E || '') && num(r.R) > 0);
console.log(`Inactive/withdrawn projects that still show remaining credits: ${inactive.length}`);

head('E. Retirements per year: CarbonPlan rows vs Berkeley columns');
const cpYear = {}; tc.filter(c => c.transaction_type === 'retirement').forEach(c => { const y = (c.transaction_date || '').slice(0, 4) || 'none'; cpYear[y] = (cpYear[y] || 0) + num(c.quantity); });
const bYear = {}; bTW.forEach(r => RC.forEach((k, i) => { if (num(r[k])) bYear[1996 + i] = (bYear[1996 + i] || 0) + num(r[k]); }));
const years = [...new Set([...Object.keys(cpYear), ...Object.keys(bYear)])].sort();
console.log('year | CarbonPlan | Berkeley | Berkeley minus CarbonPlan');
for (const y of years) console.log(`${y} | ${fmt(cpYear[y] || 0)} | ${fmt(bYear[y] || 0)} | ${fmt((bYear[y] || 0) - (cpYear[y] || 0))}`);

head('F. Buyer grouping review (CarbonPlan names)');
const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|pbc|the|company)\b/g;
const DATE_TAIL = /[\s-]*\d{2}\.\d{2}\.\d{2}.*$/;
const key = n => n.toLowerCase().replace(DATE_TAIL, '').replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
const groups = new Map();
for (const c of tc.filter(c => c.transaction_type === 'retirement')) {
  const n = (c.retirement_beneficiary_harmonized || c.retirement_beneficiary || '').trim();
  if (!n || /^[\d.\s-]*$/.test(n)) continue;
  const k = key(n); if (!k) continue;
  const g = groups.get(k) || { names: new Set(), qty: 0 }; g.names.add(n); g.qty += num(c.quantity); groups.set(k, g);
}
const merged = [...groups.entries()].filter(([, g]) => g.names.size > 1).sort((a, z) => z[1].qty - a[1].qty);
console.log(`Groups that merged more than one spelling: ${merged.length}. Check these are the same company:`);
merged.slice(0, 15).forEach(([k, g]) => console.log(`  ${[...g.names].slice(0, 4).join('  /  ')}${g.names.size > 4 ? '  ...(+' + (g.names.size - 4) + ')' : ''}`));
const keys = [...groups.keys()];
const near = [];
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const a = keys[i], b = keys[j];
  if (a.length > 3 && b.length > 3 && (a.startsWith(b + ' ') || b.startsWith(a + ' '))) near.push([a, b]);
}
console.log(`Possible same-company pairs left unmerged (one name starts with the other): ${near.length}`);
near.slice(0, 15).forEach(([a, b]) => console.log(`  "${a}"  vs  "${b}"`));
if (near.length) flag('info', `${near.length} possible same-company name pairs are not merged (for example parent and subsidiary names)`);

head('SUMMARY OF FLAGS');
for (const sev of ['warn', 'info']) flags.filter(f => f[0] === sev).forEach(f => console.log(`[${sev}] ${f[1]}`));
if (!flags.length) console.log('No flags.');
