// Checks CarbonPlan and Berkeley for newer registry data, rebuilds site/data.js and site/portfolio.js when
// something changed, checks the result, and puts the old files back if anything looks wrong.
//
// Usage:  node scripts/refresh-data.mjs [--force] [--dry-run] [--cp-zip <file>] [--xlsx <file>]
//   --force     rebuild even if the sources look unchanged
//   --dry-run   only report what is available, change nothing
//   --cp-zip / --xlsx   use local files instead of downloading (for offline use and tests)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractZip } from './zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
export const CARBONPLAN_ZIP = 'https://carbonplan-offsets-db.s3.us-west-2.amazonaws.com/production/latest/offsets-db.csv.zip';
export const BERKELEY_PAGE = 'https://gspp.berkeley.edu/berkeley-carbon-trading-project/offsets-database';
const STATE_FILE = path.join(here, 'source-state.json');
const DATA_JS = path.join(root, 'site', 'data.js');
const PORTFOLIO_JS = path.join(root, 'site', 'portfolio.js');
const UA = 'tradewater-tool-data-refresh (personal research tool)';

/* ---------- finding the newest Berkeley file ---------- */
// The version is part of the file name, so the link is read from the page. Newest version first.
export function pickBerkeleyLink(html, baseUrl = BERKELEY_PAGE) {
  const found = [];
  const re = /href=["']([^"']*Voluntary-Registry-Offsets-Database--v(\d{4}-\d{2}[\w.-]*?)\.xlsx)["']/gi;
  let m;
  while ((m = re.exec(html))) found.push({ url: new URL(m[1].replace(/&amp;/g, '&'), baseUrl).href, version: m[2] });
  if (!found.length) return null;
  found.sort((a, z) => z.version.localeCompare(a.version));
  return found[0];
}

/* ---------- small network helpers ---------- */
async function head(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HEAD ${url} returned ${res.status}`);
  return { etag: res.headers.get('etag') || '', lastModified: res.headers.get('last-modified') || '', size: Number(res.headers.get('content-length')) || 0 };
}
async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(600000) });
  if (!res.ok || !res.body) throw new Error(`Download of ${url} returned ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  const want = Number(res.headers.get('content-length')) || 0;
  const got = fs.statSync(dest).size;
  if (want && got !== want) throw new Error(`Download of ${url} was incomplete: ${got} of ${want} bytes`);
  const magic = Buffer.alloc(2); const fd = fs.openSync(dest, 'r'); fs.readSync(fd, magic, 0, 2, 0); fs.closeSync(fd);
  if (magic.toString() !== 'PK') throw new Error(`${url} did not return a zip file`);
}

/* ---------- checking the rebuilt files ---------- */
const readAssigned = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^[^=]*=\s*/, '').replace(/;\s*$/, ''));
export function validate(oldSummary) {
  const D = readAssigned(DATA_JS), P = readAssigned(PORTFOLIO_JS);
  const problems = [];
  if (!(D.projects && D.projects.length >= 50)) problems.push('fewer than 50 Tradewater projects in the buyer data');
  if (!(D.buyers && D.buyers.length > 0) || !(D.leads && D.leads.length > 0)) problems.push('no buyers or no competitor buyers');
  if (!(D.coverage && D.coverage.total > 0)) problems.push('no retired credits in the buyer data');
  if (!(P.totals && P.totals.projects >= 50 && P.totals.issued > 0)) problems.push('portfolio totals look empty');
  if (!P.version || !/^\d{4}-\d{2}-\d{2}$/.test(P.throughDate || '')) problems.push('portfolio version or date is missing');
  if (!(P.market && P.market.types && P.market.types.length >= 1)) problems.push('market comparison is missing');
  if (oldSummary && oldSummary.issued && P.totals && P.totals.issued < oldSummary.issued * 0.7) problems.push(`Tradewater credits issued fell from ${oldSummary.issued} to ${P.totals.issued}, which is more than a 30% drop`);
  return { problems, summary: { projects: P.totals.projects, issued: P.totals.issued, retired: P.totals.retired, version: P.version, throughDate: P.throughDate, carbonplan: D.generatedAt } };
}
const safeSummary = () => { try { const P = readAssigned(PORTFOLIO_JS); return { issued: P.totals.issued, retired: P.totals.retired, projects: P.totals.projects, version: P.version, throughDate: P.throughDate }; } catch (e) { return null; } };

/* ---------- main ---------- */
async function main() {
  const args = process.argv.slice(2);
  const flag = n => args.includes(n);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const force = flag('--force'), dry = flag('--dry-run');
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  const localZip = opt('--cp-zip'), localXlsx = opt('--xlsx');

  // 1. What is available?
  let cp = null, bk = null;
  if (!localZip) { cp = await head(CARBONPLAN_ZIP); console.log(`CarbonPlan: last modified ${cp.lastModified}, ${cp.size} bytes`); }
  if (!localXlsx) {
    const res = await fetch(BERKELEY_PAGE, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Berkeley page returned ${res.status}`);
    const link = pickBerkeleyLink(await res.text());
    if (!link) throw new Error('Could not find the Excel download link on the Berkeley page. The page layout may have changed.');
    bk = Object.assign({ url: link.url, version: link.version }, await head(link.url));
    console.log(`Berkeley: ${link.version}, last modified ${bk.lastModified}, ${bk.size} bytes`);
  }
  const differs = (a, b) => !b || !a || a.etag !== b.etag || a.lastModified !== b.lastModified || a.size !== b.size || (a.url && a.url !== b.url);
  const changed = force || localZip || localXlsx || differs(cp, state.carbonplan) || differs(bk, state.berkeley);
  if (!changed) { console.log('No new data. Nothing to do.'); return; }
  if (dry) { console.log('New data is available (dry run, nothing changed).'); return; }

  // 2. Fetch both sources. A rebuild uses both, so both are fetched whenever either changed.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-refresh-'));
  const backup = { data: fs.readFileSync(DATA_JS), portfolio: fs.readFileSync(PORTFOLIO_JS) };
  const oldSummary = safeSummary();
  const restore = () => { fs.writeFileSync(DATA_JS, backup.data); fs.writeFileSync(PORTFOLIO_JS, backup.portfolio); };
  try {
    const zipPath = localZip || path.join(tmp, 'offsets-db.csv.zip');
    const xlsxPath = localXlsx || path.join(tmp, 'berkeley.xlsx');
    if (!localZip) { console.log('Downloading CarbonPlan...'); await download(CARBONPLAN_ZIP, zipPath); }
    if (!localXlsx) { console.log('Downloading Berkeley...'); await download(bk.url, xlsxPath); }
    const cpDir = path.join(tmp, 'carbonplan');
    fs.mkdirSync(cpDir);
    extractZip(zipPath, cpDir);

    // 3. Rebuild.
    const run = (script, extra) => {
      const r = spawnSync(process.execPath, ['--max-old-space-size=4096', path.join(here, script), ...extra], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`${script} failed with exit code ${r.status}`);
    };
    run('build-data.mjs', [cpDir]);
    run('build-portfolio.mjs', [xlsxPath, cpDir]);

    // 4. Check before keeping.
    const { problems, summary } = validate(oldSummary);
    if (problems.length) throw new Error('The rebuilt data failed its checks: ' + problems.join('; '));

    // 5. Remember what was used, so the next run can skip unchanged sources.
    const next = Object.assign({}, state);
    if (cp) next.carbonplan = cp;
    if (bk) next.berkeley = bk;
    if (cp || bk) fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + '\n');
    console.log('Refreshed.', JSON.stringify({ before: oldSummary, after: summary }));
  } catch (err) {
    restore();
    console.error('Refresh failed, previous data files restored. ' + err.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(err => { console.error('Refresh could not run: ' + err.message); process.exit(1); });
}
