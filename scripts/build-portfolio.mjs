// Builds site/portfolio.js from the Berkeley Voluntary Registry Offsets Database (xlsx).
// Usage: node scripts/build-portfolio.mjs <path to Voluntary-Registry-Offsets-Database xlsx>
// Needs the "tar" command (included with Windows 10 and later) to read the xlsx, which is a zip file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const xlsx = process.argv[2];
if (!xlsx) { console.error('Usage: node scripts/build-portfolio.mjs <path to the Berkeley xlsx>'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'berkeley-'));
// On Windows use the built-in bsdtar, because a Git Bash "tar" cannot read zip files.
const tarBin = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tarBin, ['-xf', path.resolve(xlsx), '-C', tmp,'xl/sharedStrings.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet1.xml']);

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const ss = [...fs.readFileSync(path.join(tmp, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));

const rows = [];
const xml = fs.readFileSync(path.join(tmp, 'xl/worksheets/sheet2.xml'), 'utf8');
for (const m of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
  const o = {};
  for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const t = /t="(\w+)"/.exec(c[2]);
    const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '');
    if (!v) continue;
    o[c[1]] = (t && t[1] === 's') ? ss[+v[1]] : dec(v[1]);
  }
  rows.push(o);
}
fs.rmSync(tmp, { recursive: true, force: true });

const hi = rows.findIndex(r => Object.values(r).includes('Project ID'));
if (hi < 0 || rows[hi].A !== 'Project ID' || !/Credits\s+Issued/.test(rows[hi].P || '')) {
  console.error('Could not find the expected PROJECTS header row. Is this the Berkeley database?'); process.exit(1);
}

// "A" -> 1, "Z" -> 26, "AA" -> 27
const colNum = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = n => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
const yearCols = (startCol, firstYear = 1996, lastYear = 2026) => {
  const out = {};
  for (let y = firstYear; y <= lastYear; y++) out[y] = colName(colNum(startCol) + (y - firstYear));
  return out;
};
const VINTAGE = yearCols('X'), RETIRED = yearCols('BC'), REMAIN = yearCols('CH');
const head = rows[hi];
// Sanity check that the year blocks line up with the headers.
for (const [col, y] of [[VINTAGE[1996], 1996], [VINTAGE[2026], 2026], [RETIRED[1996], 1996], [RETIRED[2026], 2026], [REMAIN[1996], 1996], [REMAIN[2026], 2026]]) {
  if (String(head[col]).trim() !== String(y)) { console.error(`Column ${col} header is "${head[col]}", expected ${y}. The workbook layout changed.`); process.exit(1); }
}

const num = v => parseFloat(v) || 0;
const asDate = v => {
  if (!v) return '';
  if (/^\d{5}(\.\d+)?$/.test(v)) return new Date(Math.round((parseFloat(v) - 25569) * 86400000)).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
const byYear = (r, cols) => {
  const o = {};
  for (const [y, c] of Object.entries(cols)) { const v = num(r[c]); if (v) o[y] = Math.round(v); }
  return o;
};

const data = rows.slice(hi + 1).filter(r => r.A);
const tw = data.filter(r => ['B', 'O', 'DM', 'DN', 'DO'].some(k => /tradewater/i.test(r[k] || '')));

const projects = tw.map(r => ({
  id: r.A, name: r.B, registry: r.C, status: r.E || '', type: r.G, country: r.L || '', state: r.M || '',
  developer: r.O || '', issued: Math.round(num(r.P)), retired: Math.round(num(r.Q)), remaining: Math.round(num(r.R)),
  firstYear: r.W || '', listed: asDate(r.DX), registered: asDate(r.DY), certifications: r.DZ || '',
  url: /^https?:/.test(r.EB || '') ? r.EB : '',
  vintage: byYear(r, VINTAGE), retiredByYear: byYear(r, RETIRED), remainingByVintage: byYear(r, REMAIN),
})).sort((a, z) => z.remaining - a.remaining);

// ---- Optional cross-check against CarbonPlan (pass its csv folder as the second argument) ----
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
const normId = id => id.replace(/^([A-Za-z]+)0+(\d)/, '$1$2').toUpperCase();   // ACR0350 -> ACR350
const cpDir = process.argv[3];
let reconcile = null;
if (cpDir) {
  const cpProjects = new Map(parseCsv(fs.readFileSync(path.join(cpDir, 'projects.csv'), 'utf8')).map(p => [normId(p.project_id), p]));
  const cancelled = {};
  for (const c of parseCsv(fs.readFileSync(path.join(cpDir, 'credits.csv'), 'utf8'))) {
    if (c.transaction_type !== 'cancellation') continue;
    cancelled[normId(c.project_id)] = (cancelled[normId(c.project_id)] || 0) + num(c.quantity);
  }
  reconcile = { matched: 0, notInCarbonPlan: 0, carbonplanRetired: 0, berkeleyRetired: 0, diffComplianceProjects: 0, diffOther: 0, cancelled: 0, cancelledProjects: 0 };
  const rawById = Object.fromEntries(tw.map(r => [r.A, r]));
  for (const p of projects) {
    const cp = cpProjects.get(normId(p.id));
    p.cancelled = Math.round(cancelled[normId(p.id)] || 0);
    if (p.cancelled) { reconcile.cancelled += p.cancelled; reconcile.cancelledProjects += 1; }
    if (!cp) { reconcile.notInCarbonPlan += 1; continue; }
    reconcile.matched += 1;
    const d = p.retired - num(cp.retired);
    reconcile.carbonplanRetired += num(cp.retired); reconcile.berkeleyRetired += p.retired;
    if (/^ARB/i.test(rawById[p.id].D || '')) reconcile.diffComplianceProjects += d; else reconcile.diffOther += d;
  }
  reconcile.carbonplanSnapshot = JSON.parse(fs.readFileSync(path.join(cpDir, 'metadata.json'), 'utf8')).generated_at.slice(0, 10);
  for (const k of Object.keys(reconcile)) if (typeof reconcile[k] === 'number') reconcile[k] = Math.round(reconcile[k]);
  console.log('Cross-check with CarbonPlan:', reconcile);
}

const sum = (list, f) => list.reduce((s, p) => s + f(p), 0);
const addYears = (list, key) => {
  const o = {};
  for (const p of list) for (const [y, v] of Object.entries(p[key])) o[y] = (o[y] || 0) + v;
  return o;
};
const group = (list, f) => {
  const g = {};
  for (const p of list) {
    const k = f(p) || 'Unknown';
    g[k] = g[k] || { name: k, projects: 0, issued: 0, retired: 0, remaining: 0 };
    g[k].projects += 1; g[k].issued += p.issued; g[k].retired += p.retired; g[k].remaining += p.remaining;
  }
  return Object.values(g).sort((a, z) => z.issued - a.issued);
};

// ---- Who else sells these credits: every project of the same Berkeley types, grouped by developer ----
const twTypeNames = new Set(projects.map(p => p.type));
const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|pbc|the|company|lp|l p)\b/g;
const devKey = n => (n || '').toLowerCase().replace(/\(pp\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
const twRows = new Set(tw);
const sameType = data.filter(r => twTypeNames.has(r.G));
const blank = () => ({ projects: 0, issued: 0, retired: 0, remaining: 0 });
const addTo = (o, r) => { o.projects += 1; o.issued += num(r.P); o.retired += num(r.Q); o.remaining += num(r.R); };
const rnd = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
const market = { types: [], all: blank(), tradewater: blank(), issuedByVintage: { tradewater: {}, others: {} }, retiredByYear: { tradewater: {}, others: {} } };
for (const type of twTypeNames) {
  const rows = sameType.filter(r => r.G === type);
  const t = { name: type, all: blank(), tradewater: blank(), developers: new Map() };
  for (const r of rows) {
    const isTw = twRows.has(r);
    addTo(t.all, r); addTo(market.all, r);
    if (isTw) { addTo(t.tradewater, r); addTo(market.tradewater, r); }
    const key = isTw ? 'tradewater' : devKey(r.O) || 'unknown';
    const dev = t.developers.get(key) || { names: {}, isTradewater: isTw, ...blank() };
    dev.names[isTw ? 'Tradewater' : (r.O || 'Unknown developer').trim()] = (dev.names[isTw ? 'Tradewater' : (r.O || 'Unknown developer').trim()] || 0) + num(r.P);
    addTo(dev, r); t.developers.set(key, dev);
    const side = isTw ? 'tradewater' : 'others';
    for (const [y, c] of Object.entries(VINTAGE)) if (num(r[c])) market.issuedByVintage[side][y] = (market.issuedByVintage[side][y] || 0) + num(r[c]);
    for (const [y, c] of Object.entries(RETIRED)) if (num(r[c])) market.retiredByYear[side][y] = (market.retiredByYear[side][y] || 0) + num(r[c]);
  }
  const devs = [...t.developers.values()].map(d => ({
    name: d.isTradewater ? 'Tradewater' : Object.entries(d.names).sort((a, z) => z[1] - a[1])[0][0],
    isTradewater: d.isTradewater, projects: d.projects, issued: Math.round(d.issued), retired: Math.round(d.retired), remaining: Math.round(d.remaining),
  })).sort((a, z) => z.issued - a.issued);
  const twRank = devs.findIndex(d => d.isTradewater) + 1;
  const top = devs.slice(0, 8);
  if (twRank > 8) top.push(devs[twRank - 1]);   // always show Tradewater, even when it ranks lower
  market.types.push({ name: type, all: rnd(t.all), tradewater: rnd(t.tradewater), developerCount: devs.length, twRank, developers: top });
}
market.all = rnd(market.all); market.tradewater = rnd(market.tradewater);
for (const side of ['tradewater', 'others']) for (const k of ['issuedByVintage', 'retiredByYear']) for (const y of Object.keys(market[k][side])) market[k][side][y] = Math.round(market[k][side][y]);
market.types.sort((a, z) => z.all.issued - a.all.issued);

const out = {
  version: 'v2026-08',
  market,
  byRegistry: group(projects, p => p.registry),
  throughDate: '2026-08-31',
  totals: {
    projects: projects.length,
    issued: sum(projects, p => p.issued), retired: sum(projects, p => p.retired), remaining: sum(projects, p => p.remaining),
  },
  reconcile,
  retiredByYear: addYears(projects, 'retiredByYear'),
  remainingByVintage: addYears(projects, 'remainingByVintage'),
  issuedByVintage: addYears(projects, 'vintage'),
  byType: group(projects, p => p.type),
  byCountry: group(projects, p => p.country),
  byStatus: group(projects, p => p.status),
  projects,
};

fs.writeFileSync(path.join(here, '..', 'site', 'portfolio.js'), 'window.TW_PORTFOLIO = ' + JSON.stringify(out) + ';\n');
console.log(`Wrote site/portfolio.js: ${projects.length} Tradewater projects of ${data.length} in the workbook`);
console.log('Totals:', out.totals);
console.log('By type:', out.byType.map(t => `${t.name} ${t.projects}`).join('; '));
console.log('By status:', out.byStatus.map(t => `${t.name} ${t.projects}`).join('; '));
