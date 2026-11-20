// Builds site/data.js from CarbonPlan OffsetsDB CSV files: every named retirement on Tradewater-type projects, other developers, registries.
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
// Projects that are Tradewater's per the Berkeley database (developer field) but do not say so in CarbonPlan's name or proponent.
// IDs are compared without leading zeros, so ACR0670 and ACR670 are the same project.
const normId = id => id.replace(/^([A-Za-z]+)0+(\d)/, '$1$2').toUpperCase();
const extraIds = new Set(JSON.parse(fs.readFileSync(path.join(here, 'extra-tradewater-projects.json'), 'utf8')).map(normId));
const isTradewater = p => /tradewater/i.test(p.name) || /tradewater/i.test(p.proponent) || extraIds.has(normId(p.project_id));

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
const noteSnip = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 160);

// ---- Which projects count: Tradewater's, and other developers' projects of the same types ----
const twTypes = new Set(Object.values(typeById).filter(t => t !== 'Unknown'));
// Developer label: the registry's proponent field, or the project name when that is blank, with a trailing
// version or year removed so "A-Gas V6" and "A-Gas V14" group as "A-Gas".
const TAIL = /[\s,-]*(v\d+|20\d\d(-\d+)?|\d{7})$/i;
function developerName(p) {
  let n = (p.proponent || '').trim() || p.name.trim();
  for (let i = 0; i < 3 && TAIL.test(n); i++) n = n.replace(TAIL, '').trim();
  return n || p.name;
}
const projInfo = new Map();   // project_id -> { tw, type, developer, url, registry }
for (const p of projects) {
  const t = projectType(p);
  if (twIds.has(p.project_id)) projInfo.set(p.project_id, { tw: true, type: typeById[p.project_id], developer: 'Tradewater', url: p.project_url, registry: p.registry });
  else if (twTypes.has(t)) projInfo.set(p.project_id, { tw: false, type: t, developer: developerName(p), url: p.project_url, registry: p.registry });
}
const registryOf = Object.fromEntries(projects.map(p => [p.project_id, p.registry]));

// ---- One pass over every credit row ----
const companies = new Map();   // nameKey -> company
const developers = new Map();  // developer -> { projects, customers, intermediaries, total, last }
const cover = { total: 0, beneficiary: 0, account: 0, tradewaterOwn: 0, unnamed: 0, unnamedNov1: 0 };
const nov1Years = new Set();
const regStats = {};           // registry -> { latestRetirement, latestIssuance, rows }
for (const p of projects) regStats[p.registry] = regStats[p.registry] || { latestRetirement: '', latestIssuance: '', rows: 0 };
const isInter = key => intermediaries.some(k => key.includes(k));
const bump = (map, key, qty, date, name) => {
  let o = map.get(key);
  if (!o) { o = { name, qty: 0, count: 0, last: '' }; map.set(key, o); }
  o.qty += qty; o.count += 1; if (date > o.last) o.last = date;
};

for (const c of credits) {
  const date = (c.transaction_date || '').slice(0, 10);
  const reg = regStats[registryOf[c.project_id]];
  if (reg && date) {
    if (c.transaction_type === 'retirement' && date > reg.latestRetirement) reg.latestRetirement = date;
    if (c.transaction_type === 'issuance' && date > reg.latestIssuance) reg.latestIssuance = date;
  }
  if (c.transaction_type !== 'retirement') continue;
  const info = projInfo.get(c.project_id);
  if (!info) continue;
  const qty = num(c.quantity);
  reg.rows += 1;

  let ben = (c.retirement_beneficiary_harmonized || c.retirement_beneficiary || '').trim();
  if (/^[\d.\s-]*$/.test(ben)) ben = '';   // dates or ids like "20.03.02" are not buyer names
  let acct = (c.retirement_account || '').trim();
  if (/^\d+$/.test(acct)) acct = '';
  const own = /^tradewater/i.test(acct);

  // Who is the customer, and which intermediary (if any) retired the credits for them
  let customer = '', via = '', mid = '';
  if (ben) { customer = ben; via = 'beneficiary'; if (acct && !own && isInter(nameKey(acct)) && nameKey(acct) !== nameKey(ben)) mid = acct; }
  else if (acct && !own) { customer = acct; via = 'account'; }

  if (info.tw) {
    cover.total += qty;
    if (via === 'beneficiary') cover.beneficiary += qty;
    else if (via === 'account') cover.account += qty;
    else if (own) cover.tradewaterOwn += qty;
    else { cover.unnamed += qty; if (date.slice(5, 10) === '11-01') { cover.unnamedNov1 += qty; nov1Years.add(date.slice(0, 4)); } }
  }
  if (!customer) continue;
  const key = nameKey(customer);
  if (!key || /^tradewater/.test(key)) continue;

  let co = companies.get(key);
  if (!co) { co = { id: slug(key), key, names: {}, via: { beneficiary: 0, account: 0 }, tx: [] }; companies.set(key, co); }
  co.names[customer] = (co.names[customer] || 0) + qty;
  co.via[via] += qty;
  co.tx.push([date, Math.round(qty), c.project_id, c.vintage, info.developer, mid ? cleanName(mid) : '', noteSnip(c.retirement_note)]);

  if (!info.tw) {
    let d = developers.get(info.developer);
    if (!d) { d = { name: info.developer, projects: new Set(), customers: new Map(), intermediaries: new Map(), total: 0, last: '' }; developers.set(info.developer, d); }
    d.projects.add(c.project_id); d.total += qty; if (date > d.last) d.last = date;
    if (isInter(key)) bump(d.intermediaries, key, qty, date, cleanName(customer));
    else bump(d.customers, key, qty, date, cleanName(customer));
    if (mid) bump(d.intermediaries, nameKey(mid), qty, date, cleanName(mid));
  }
}

const companyOut = [...companies.values()].map(co => {
  co.tx.sort((a, z) => z[0].localeCompare(a[0]));
  const name = cleanName(Object.entries(co.names).sort((a, z) => z[1] - a[1])[0][0]);
  const kind = isInter(co.key) ? 'intermediary' : (co.via.account > co.via.beneficiary ? 'account' : 'buyer');
  return { id: co.id, key: co.key, name, kind, tx: co.tx };
}).sort((a, z) => z.tx.length - a.tx.length);

const rowsOf = m => [...m.values()].sort((a, z) => z.qty - a.qty).map(o => [o.name, Math.round(o.qty), o.count, o.last]);
const developerOut = [...developers.values()].map(d => ({
  name: d.name, projects: d.projects.size, total: Math.round(d.total), last: d.last,
  customers: rowsOf(d.customers), intermediaries: rowsOf(d.intermediaries),
})).sort((a, z) => z.total - a.total);

const REGISTRY_INFO = {
  verra: ['Verra', 'https://registry.verra.org'],
  'american-carbon-registry': ['American Carbon Registry', 'https://acr2.apx.com'],
  'climate-action-reserve': ['Climate Action Reserve', 'https://thereserve2.apx.com'],
  'gold-standard': ['Gold Standard', 'https://registry.goldstandard.org'],
  'art-trees': ['ART TREES', 'https://art.apx.com'],
  cercarbono: ['Cercarbono (via EcoRegistry)', 'https://www.ecoregistry.io'],
  isometric: ['Isometric', 'https://registry.isometric.com'],
};
// Only registries that hold projects this tool covers
const usedRegistries = new Set([...projInfo.values()].map(i => i.registry));
const registries = [...usedRegistries].map(id => ({
  id, name: (REGISTRY_INFO[id] || [id])[0], url: (REGISTRY_INFO[id] || [])[1] || '',
  projects: [...projInfo.values()].filter(i => i.registry === id).length,
  retirements: regStats[id].rows,
  latestRetirement: regStats[id].latestRetirement, latestIssuance: regStats[id].latestIssuance,
})).sort((a, z) => z.retirements - a.retirements);

const usedIds = new Set(companyOut.flatMap(c => c.tx.map(t => t[2])));
const data = {
  generatedAt: metadata.generated_at,
  source: 'CarbonPlan OffsetsDB',
  types: [...twTypes],
  unnamedNov1Years: [...nov1Years].sort(),
  coverage: Object.fromEntries(Object.entries(cover).map(([k, v]) => [k, Math.round(v)])),
  registries,
  projects: twProjects.map(p => ({
    id: p.project_id, name: p.name, registry: p.registry, type: projectType(p), url: p.project_url,
    issued: Math.round(num(p.issued)), retired: Math.round(num(p.retired)),
  })).sort((a, z) => z.retired - a.retired),
  projectUrls: Object.fromEntries([...usedIds].map(id => [id, projInfo.get(id).url])),
  companies: companyOut,
  developers: developerOut,
};

const target = path.join(here, '..', 'site', 'data.js');
fs.writeFileSync(target, 'window.TW_DATA = ' + JSON.stringify(data) + ';\n');
console.log(`Wrote ${target}`);
console.log(`${twProjects.length} Tradewater projects, ${companyOut.length} companies, ${developerOut.length} other developers, ${cover.total} credits retired`);
console.log('Coverage (credits):', data.coverage);
