// Builds site/news.js: recent headlines from Google News RSS searches, grouped by topic.
// Only the headline, link, publisher and date are kept, never article text. Run: node scripts/refresh-news.mjs
// If every search fails, the old file is kept and the script exits with an error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'site', 'news.js');
const DAYS = 60, MAX_ITEMS = 150;

// Topic name -> search queries. Edit these to change what the News tab follows.
const TOPICS = {
  'Carbon credit market': ['"voluntary carbon market"', '"carbon credits" price OR demand OR retirement'],
  'Refrigerants and HFCs': ['"HFC" refrigerant reclamation carbon', '"refrigerant" "carbon credits"', 'AIM Act HFC phasedown'],
  'Methane and oil & gas wells': ['orphan well plugging carbon credits', 'methane abatement carbon credits oil gas wells'],
  'Ozone-depleting substances': ['ozone-depleting substances carbon offsets', 'ODS destruction carbon credits'],
  'Buyers and policy': ['corporate carbon credit purchase retire', 'CARB OR "Washington Ecology" carbon offsets compliance'],
};

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tagText = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? decode(m[1]) : ''; };

async function fetchFeed(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ` when:${DAYS}d`)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; headline-reader)' } });
  if (!res.ok) throw new Error(`${res.status} for ${query}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const block = m[1];
    const source = tagText(block, 'source');
    let title = tagText(block, 'title');
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    const d = new Date(tagText(block, 'pubDate'));
    return { title, link: tagText(block, 'link'), source, date: isNaN(d) ? '' : d.toISOString().slice(0, 10) };
  }).filter(i => i.title && i.link && i.date);
}

const byLink = new Map();
let ok = 0, failed = 0;
for (const [topic, queries] of Object.entries(TOPICS)) {
  for (const q of queries) {
    try {
      const items = await fetchFeed(q); ok++;
      console.log(`${topic}: ${items.length} for ${q}`);
      for (const i of items) { const prev = byLink.get(i.link); if (prev) prev.topics.add(topic); else byLink.set(i.link, { ...i, topics: new Set([topic]) }); }
    } catch (e) { failed++; console.warn('Failed:', e.message); }
    await new Promise(r => setTimeout(r, 800));
  }
}
if (!ok || !byLink.size) { console.error('No headlines fetched. Keeping the old file.'); process.exit(1); }

// The same story often comes from several searches under different links: keep one per headline.
const seen = new Set();
const items = [...byLink.values()].sort((a, z) => z.date.localeCompare(a.date))
  .filter(i => { const k = i.title.toLowerCase().replace(/[^a-z0-9]/g, ''); if (seen.has(k)) return false; seen.add(k); return true; })
  .slice(0, MAX_ITEMS).map(i => ({ title: i.title, link: i.link, source: i.source, date: i.date, topics: [...i.topics] }));

const data = { updatedAt: new Date().toISOString(), topics: Object.keys(TOPICS), items };
fs.writeFileSync(OUT, 'window.TW_NEWS = ' + JSON.stringify(data) + ';\n');
console.log(`Wrote ${OUT}: ${items.length} headlines (${ok} searches ok, ${failed} failed)`);
