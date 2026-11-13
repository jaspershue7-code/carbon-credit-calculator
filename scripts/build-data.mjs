// Builds site/data.js from CarbonPlan OffsetsDB CSV files.
// Usage: node scripts/build-data.mjs <folder with projects.csv, credits.csv, metadata.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = process.argv[2];
if (!srcDir) {
  console.error('Usage: node scripts/build-data.mjs <folder with the OffsetsDB csv files>');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  const good = rows.filter(r => r.length === head.length);
  if (good.length !== rows.length) console.warn(`Skipped ${rows.length - good.length} malformed rows`);
  return good.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const read = f => fs.readFileSync(path.join(srcDir, f), 'utf8');
const projects = parseCsv(read('projects.csv'));
const credits = parseCsv(read('credits.csv'));
const metadata = JSON.parse(read('metadata.json'));

// Marketplaces, traders and other likely intermediaries (my judgment, edit the file to change).
const intermediaries = JSON.parse(fs.readFileSync(path.join(here, 'intermediaries.json'), 'utf8'));

const num = v => parseFloat(v) || 0;
const isTradewater = p => /tradewater/i.test(p.name) || /tradewater/i.test(p.proponent);

const twProjects = projects.filter(isTradewater);
const twIds = new Set(twProjects.map(p => p.project_id));

function projectType(p) {
  if (p.project_type && p.project_type !== 'Unknown') return p.project_type;
  const proto = (p.protocol || '').toLowerCase();
  if (/ods|ozone/.test(proto)) return 'Ozone Depleting Substances';
  if (/hfc/.test(proto)) return 'HFC Reclamation';
  return 'Unknown';
}
const typeById = Object.fromEntries(twProjects.map(p => [p.project_id, projectType(p)]));

// Name cleanup so "Aledade, Inc" and "Aledade, Inc." become one buyer.
const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|pbc|the|company)\b/g;
const DATE_TAIL = /[\s-]*\d{2}\.\d{2}\.\d{2}.*$/;   // "Climate Heroes - 22.01.01 - 2", "Climate Heroes 20.03.08"
const cleanName = name => name.replace(DATE_TAIL, '').trim() || name;
function nameKey(name) {
  return name.toLowerCase()
    .replace(DATE_TAIL, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(SUFFIX, ' ')
    .replace(/\s+/g, ' ').trim();
}
const slug = key => key.replace(/ /g, '-') || 'unnamed';

const buyers = new Map();
const cover = { total: 0, beneficiary: 0, account: 0, tradewaterOwn: 0, unnamed: 0 };
const noteSnip = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 160);

for (const c of credits) {
  if (c.transaction_type !== 'retirement' || !twIds.has(c.project_id)) continue;
  const qty = num(c.quantity);
  cover.total += qty;

  let ben = (c.retirement_beneficiary_harmonized || c.retirement_beneficiary || '').trim();
  if (/^[\d.\s-]*$/.test(ben)) ben = '';   // dates or ids like "20.03.02" are not buyer names
  const acct = (c.retirement_account || '').trim();
  let name = '', via = '';
  if (ben) { name = ben; via = 'beneficiary'; cover.beneficiary += qty; }
  else if (/^tradewater/i.test(acct)) { cover.tradewaterOwn += qty; name = 'Tradewater (retired from its own account)'; via = 'tradewater'; }
  else if (acct && !/^\d+$/.test(acct)) { name = acct; via = 'account'; cover.account += qty; }
  else { cover.unnamed += qty; name = 'No buyer recorded'; via = 'none'; }

  const key = via === 'tradewater' ? 'tradewater-own' : via === 'none' ? 'no-buyer-recorded' : nameKey(name);
  if (!key) continue;
  let b = buyers.get(key);
  if (!b) {
    b = { id: slug(key), key, names: {}, total: 0, count: 0, first: '', last: '', byYear: {}, byType: {}, viaVol: {}, tx: [] };
    buyers.set(key, b);
  }
  const date = (c.transaction_date || '').slice(0, 10);
  const year = date.slice(0, 4);
  b.names[name] = (b.names[name] || 0) + qty;
  b.total += qty; b.count += 1;
  if (date && (!b.first || date < b.first)) b.first = date;
  if (date && date > b.last) b.last = date;
  b.byYear[year || 'unknown'] = (b.byYear[year || 'unknown'] || 0) + qty;
  const type = typeById[c.project_id];
  b.byType[type] = (b.byType[type] || 0) + qty;
  b.viaVol[via] = (b.viaVol[via] || 0) + qty;
  b.tx.push([date, qty, c.project_id, c.vintage, via, noteSnip(c.retirement_note)]);
}

const out = [];
for (const b of buyers.values()) {
  const name = cleanName(Object.entries(b.names).sort((a, z) => z[1] - a[1])[0][0]);
  const special = b.key === 'tradewater-own' ? 'tradewater' : b.key === 'no-buyer-recorded' ? 'none' : '';
  const kind = special
    || (intermediaries.some(k => b.key.includes(k)) ? 'intermediary' : '')
    || ((b.viaVol.account || 0) > (b.viaVol.beneficiary || 0) ? 'account' : 'buyer');
  b.tx.sort((a, z) => z[0].localeCompare(a[0]));
  out.push({
    id: b.id, name, kind, total: Math.round(b.total), count: b.count, first: b.first, last: b.last,
    yearsActive: Object.keys(b.byYear).filter(y => y !== 'unknown').length,
    byYear: b.byYear, byType: b.byType, tx: b.tx,
  });
}
out.sort((a, z) => z.total - a.total);

// ---- Competitor buyers: who retires Tradewater-type credits from OTHER proponents ----
const twTypes = new Set(Object.values(typeById).filter(t => t !== 'Unknown'));
const otherProj = new Map();   // project_id -> { type, proponent, name }
for (const p of projects) {
  if (twIds.has(p.project_id)) continue;
  const t = projectType(p);
  if (twTypes.has(t)) otherProj.set(p.project_id, { type: t, proponent: (p.proponent || '').trim() || p.name, name: p.name });
}
const twKeys = new Set([...buyers.keys()]);
const leads = new Map();
const leadCover = { total: 0, named: 0 };
for (const c of credits) {
  if (c.transaction_type !== 'retirement') continue;
  const pr = otherProj.get(c.project_id);
  if (!pr) continue;
  const qty = num(c.quantity);
  leadCover.total += qty;
  let name = (c.retirement_beneficiary_harmonized || c.retirement_beneficiary || '').trim();
  let via = 'beneficiary';
  if (/^[\d.\s-]*$/.test(name)) name = '';
  if (!name) {
    const acct = (c.retirement_account || '').trim();
    if (acct && !/^\d+$/.test(acct) && !/^tradewater/i.test(acct)) { name = acct; via = 'account'; }
  }
  if (!name) continue;
  leadCover.named += qty;
  const key = nameKey(name);
  if (!key || twKeys.has(key) || /tradewater/.test(key)) continue;   // already a Tradewater buyer
  let l = leads.get(key);
  if (!l) { l = { key, names: {}, total: 0, count: 0, first: '', last: '', byYear: {}, byType: {}, viaVol: {}, props: {}, tx: [] }; leads.set(key, l); }
  const date = (c.transaction_date || '').slice(0, 10);
  l.names[name] = (l.names[name] || 0) + qty;
  l.total += qty; l.count += 1;
  if (date && (!l.first || date < l.first)) l.first = date;
  if (date && date > l.last) l.last = date;
  const y = date.slice(0, 4) || 'unknown';
  l.byYear[y] = (l.byYear[y] || 0) + qty;
  l.byType[pr.type] = (l.byType[pr.type] || 0) + qty;
  l.viaVol[via] = (l.viaVol[via] || 0) + qty;
  l.props[pr.proponent] = (l.props[pr.proponent] || 0) + qty;
  l.tx.push([date, qty, c.project_id, c.vintage, noteSnip(c.retirement_note), pr.proponent]);
}
const leadOut = [...leads.values()].map(l => {
  l.tx.sort((a, z) => z[0].localeCompare(a[0]));
  const kind = intermediaries.some(k => l.key.includes(k)) ? 'intermediary'
    : ((l.viaVol.account || 0) > (l.viaVol.beneficiary || 0) ? 'account' : 'buyer');
  return {
    id: slug(l.key), name: cleanName(Object.entries(l.names).sort((a, z) => z[1] - a[1])[0][0]), kind,
    total: Math.round(l.total), count: l.count, first: l.first, last: l.last,
    yearsActive: Object.keys(l.byYear).filter(y => y !== 'unknown').length,
    byYear: l.byYear, byType: l.byType,
    proponents: Object.entries(l.props).sort((a, z) => z[1] - a[1]).slice(0, 5).map(([n, v]) => [n, Math.round(v)]),
    tx: l.tx.slice(0, 30),
  };
}).sort((a, z) => z.total - a.total);

const data = {
  generatedAt: metadata.generated_at,
  leadTypes: [...twTypes],
  leadCoverage: { total: Math.round(leadCover.total), named: Math.round(leadCover.named) },
  leads: leadOut,
  source: 'CarbonPlan OffsetsDB',
  coverage: Object.fromEntries(Object.entries(cover).map(([k, v]) => [k, Math.round(v)])),
  projects: twProjects.map(p => ({
    id: p.project_id, name: p.name, registry: p.registry, type: projectType(p), country: p.country,
    status: p.status, issued: Math.round(num(p.issued)), retired: Math.round(num(p.retired)), url: p.project_url,
  })).sort((a, z) => z.retired - a.retired),
  buyers: out,
};

const target = path.join(here, '..', 'site', 'data.js');
fs.writeFileSync(target, 'window.TW_DATA = ' + JSON.stringify(data) + ';\n');
console.log(`Wrote ${target}`);
console.log(`${twProjects.length} Tradewater projects, ${out.length} buyer groups, ${cover.total} credits retired`);
console.log('Coverage (credits):', data.coverage);
