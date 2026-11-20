// Six tabs: Search, Customers, Watchlist, News, AI, Data. Company and developer pages open from search results.
// All numbers come from site/data.js. The watchlist is saved in this browser (localStorage).
(function () {
  const D = window.TW_DATA;
  const { fmt, el, btn, today } = window.TWKit;
  const view = document.getElementById('view');
  const refresh = () => window.TWKit.refresh();

  // ---------- shared ----------
  const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|pbc|the|company)\b/g;   // same cleanup as scripts/build-data.mjs
  const nameKey = n => (n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
  const twIds = new Set(D.projects.map(p => p.id));
  // A retirement row is [date, credits, project, vintage, developer, intermediary, registry note]
  const isTw = t => twIds.has(t[2]);
  const sum = rows => rows.reduce((s, t) => s + t[1], 0);
  const latest = rows => rows.reduce((m, t) => (t[0] > m ? t[0] : m), '');
  const projLink = pid => D.projectUrls[pid] ? el('a', { href: D.projectUrls[pid], target: '_blank', rel: 'noopener' }, pid) : pid;
  const companyById = id => D.companies.find(c => c.id === id);
  const companyByKey = key => D.companies.find(c => c.key === key);
  const KIND = { intermediary: 'Intermediary', account: 'Account holder' };
  const tag = c => (KIND[c.kind] ? el('span', { class: 'tag' }, KIND[c.kind]) : null);
  const daysOld = d => Math.round((Date.parse(today()) - Date.parse(d)) / 86400000);
  const snapshotDate = D.generatedAt.slice(0, 10);
  const link = (href, text) => el('a', { href }, text);
  const companyLink = c => link('#/company/' + encodeURIComponent(c.id), c.name);
  const facts = items => el('ul', { class: 'facts' }, items.map(([v, label]) => el('li', {}, el('b', {}, v), el('span', {}, label))));
  const hint = (summary, text) => el('details', { class: 'hint' }, el('summary', {}, summary), el('p', {}, text));
  const section = (title, ...kids) => el('section', {}, el('h2', {}, title), ...kids);

  const search = (value, placeholder, oninput, cls = '') => {
    const i = el('input', { type: 'search', placeholder, value, 'aria-label': placeholder, class: cls, autocomplete: 'off' });
    i.addEventListener('input', () => oninput(i.value));
    return i;
  };
  // A row of buttons where one is selected
  const seg = (options, value, onchange) => el('div', { class: 'seg', role: 'group' },
    options.map(([v, label]) => el('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onchange(v) }, label)));

  // ---------- tables with a CSV download ----------
  function csvOf(t) {
    const cols = [...t.tHead.rows[0].cells].map((c, i) => (c.textContent.trim() ? i : -1)).filter(i => i >= 0);
    const cell = td => {
      const c = td.cloneNode(true);
      c.querySelectorAll('.tag, button').forEach(n => n.remove());
      let s = c.textContent.replace(/\s+/g, ' ').trim();
      if (td.classList.contains('num')) s = s.replace(/,/g, '');
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const out = [cols.map(i => cell(t.tHead.rows[0].cells[i]))];
    [...t.tBodies[0].rows].forEach(r => out.push(cols.map(i => cell(r.cells[i]))));
    return out.map(r => r.join(',')).join('\r\n');
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: `${name}-${today()}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function table(head, body, name) {
    const t = el('table', {}, el('thead', {}, el('tr', {}, head.map(([label, cls]) => el('th', { class: cls || '' }, label)))), el('tbody', {}, body));
    return el('div', { class: 'tablewrap' },
      el('div', { class: 'tbar' }, el('span', { class: 'muted' }, `${body.length} row${body.length === 1 ? '' : 's'}`),
        btn('Download CSV', () => download(name, csvOf(t)), 'small')),
      el('div', { class: 'scroll' }, t));
  }

  // Retirement table. rows: [{ company, t, isNew }]
  function retirements(rows, name, { withCompany = false, showNew = false } = {}) {
    if (!rows.length) return el('p', { class: 'empty' }, 'No retirements.');
    const head = [['Date'], ...(withCompany ? [['Company']] : []), ['Credits', 'num'], ['Developer'], ['Intermediary', 'hide-sm'], ['Project'], ['Registry note', 'hide-sm']];
    return table(head, rows.map(({ company, t, isNew }) => el('tr', {},
      el('td', { class: 'date' }, t[0] || 'unknown', showNew && isNew ? el('span', { class: 'tag warn' }, 'New') : null),
      withCompany ? el('td', { class: 'name' }, companyLink(company)) : null,
      el('td', { class: 'num' }, fmt(t[1])),
      el('td', {}, t[4]),
      el('td', { class: 'hide-sm' }, t[5] || '–'),
      el('td', {}, projLink(t[2]), t[3] ? el('span', { class: 'muted' }, ` (vintage ${t[3]})`) : null),
      el('td', { class: 'hide-sm muted' }, t[6]))), name);
  }

  // ---------- watchlist storage ----------
  const WKEY = 'tradewater-watchlist-v1';
  let wl = { items: [] };
  try { const raw = localStorage.getItem(WKEY); if (raw) wl = JSON.parse(raw); } catch (e) { /* storage blocked: the list lasts until the tab closes */ }
  const saveWl = () => { try { localStorage.setItem(WKEY, JSON.stringify(wl)); } catch (e) { /* ignore */ } };
  const txKey = t => t.slice(0, 5).join('|');
  const seenMap = c => { const m = {}; (c ? c.tx : []).forEach(t => { const k = txKey(t); m[k] = (m[k] || 0) + 1; }); return m; };
  const isWatched = key => wl.items.some(i => i.key === key);
  function addWatch(name, key) {
    if (!key || isWatched(key)) return false;
    const c = companyByKey(key);
    wl.items.push({ key, name: c ? c.name : name.trim(), seen: seenMap(c) });
    saveWl(); return true;
  }
  function removeWatch(key) { wl.items = wl.items.filter(i => i.key !== key); saveWl(); }
  const toggleWatch = (name, key) => { isWatched(key) ? removeWatch(key) : addWatch(name, key); refresh(); };

  // Retirements not seen at the last visit to the Watchlist tab. Worked out once per page load, so they stay
  // highlighted while you look at them and count as seen for next time.
  const newCache = new Map();
  function newIndexes(item) {
    if (!newCache.has(item.key)) {
      const c = companyByKey(item.key), seen = Object.assign({}, item.seen), out = new Set();
      (c ? c.tx : []).forEach((t, i) => { const k = txKey(t); if (seen[k] > 0) seen[k]--; else out.add(i); });
      newCache.set(item.key, out);
    }
    return newCache.get(item.key);
  }
  let acknowledged = false;
  const newCount = () => (acknowledged ? 0 : wl.items.reduce((n, i) => n + newIndexes(i).size, 0));
  function markSeen() { wl.items.forEach(i => { i.seen = seenMap(companyByKey(i.key)); }); saveWl(); acknowledged = true; }

  const star = (name, key) => {
    const on = isWatched(key);
    return el('button', { type: 'button', class: 'star' + (on ? ' on' : ''), 'aria-pressed': String(on), 'aria-label': (on ? 'Remove ' : 'Add ') + name + (on ? ' from' : ' to') + ' watchlist', title: on ? 'On your watchlist' : 'Add to watchlist', onclick: () => toggleWatch(name, key) }, on ? '★' : '☆');
  };
  const watchButton = (name, key) => btn(isWatched(key) ? '★ On watchlist (remove)' : '☆ Add to watchlist', () => toggleWatch(name, key), isWatched(key) ? '' : 'primary');
  // Turns typed names into companies: exact name, then exact cleaned name, then a single partial match
  function resolve(name) {
    const lower = name.trim().toLowerCase(), k = nameKey(name);
    return D.companies.find(c => c.name.toLowerCase() === lower) || companyByKey(k) ||
      (k.length >= 3 ? (m => (m.length === 1 ? m[0] : null))(D.companies.filter(c => c.key.includes(k))) : null);
  }

  // ---------- Search (home) ----------
  const ui = { q: '', period: 'all', cq: '', flash: '', newsTopic: 'all' };

  // ---------- news (site/news.js, rebuilt daily by scripts/refresh-news.mjs) ----------
  const NEWS = window.TW_NEWS || { updatedAt: '', topics: [], items: [] };
  // Watchlist companies named in a headline (whole-word match on the cleaned name)
  const mentions = item => {
    const t = ' ' + nameKey(item.title) + ' ';
    return wl.items.filter(w => w.key.length >= 4 && t.includes(' ' + w.key + ' ')).map(w => w.name);
  };
  const newsLine = (item, withTopics) => {
    const who = mentions(item);
    return el('li', { class: 'newsitem' },
      el('a', { href: item.link, target: '_blank', rel: 'noopener' }, item.title),
      el('div', { class: 'newsmeta' }, [item.source, item.date].filter(Boolean).join(' · '),
        who.map(n => el('span', { class: 'tag warn' }, '★ ' + n)),
        withTopics ? item.topics.map(t => el('span', { class: 'tag' }, t)) : null));
  };
  // The quick summary on the home page: latest three headlines and a count per topic
  function newsWidget() {
    if (!NEWS.items.length) return null;
    const watched = NEWS.items.filter(i => mentions(i).length).length;
    const go = topic => { ui.newsTopic = topic; location.hash = '#/news'; };
    return el('section', { class: 'newswidget' },
      el('div', { class: 'widgethead' }, el('h2', {}, 'In the news'), link('#/news', 'See all news →')),
      el('ul', { class: 'newslist' }, NEWS.items.slice(0, 3).map(i => newsLine(i, false))),
      el('p', { class: 'chips' },
        NEWS.topics.map(t => el('button', { type: 'button', class: 'chip', onclick: () => go(t) }, `${t} (${NEWS.items.filter(i => i.topics.includes(t)).length})`)),
        wl.items.length ? el('button', { type: 'button', class: 'chip', onclick: () => go('watchlist') }, `★ Mentions your watchlist (${watched})`) : null));
  }

  function newsView() {
    document.title = 'News | Tradewater Credit Tracker';
    const root = el('div');
    const topic = NEWS.topics.includes(ui.newsTopic) || ui.newsTopic === 'watchlist' ? ui.newsTopic : 'all';
    const rows = NEWS.items.filter(i => topic === 'all' || (topic === 'watchlist' ? mentions(i).length : i.topics.includes(topic)));
    const watched = NEWS.items.filter(i => mentions(i).length).length;
    root.append(el('h1', {}, 'News'),
      el('p', { class: 'sub' }, NEWS.updatedAt ? `Headlines on the carbon credit market. Updated ${NEWS.updatedAt.slice(0, 10)}.` : 'No headlines saved yet.'),
      hint('Where the headlines come from', 'Google News searches on the topics below, refreshed once a day by a GitHub job. Only the headline, publisher, date and link are kept, and links open the publisher\'s page. Search terms are in scripts/refresh-news.mjs. A ★ tag means the headline names a company on your watchlist (a name match, so check it).'));
    if (!NEWS.items.length) return root;
    root.append(el('div', { class: 'toolbar' }, el('div', { class: 'seg' },
      [['all', `All (${NEWS.items.length})`], ...NEWS.topics.map(t => [t, `${t} (${NEWS.items.filter(i => i.topics.includes(t)).length})`]), ['watchlist', `★ Watchlist (${watched})`]]
        .map(([v, label]) => el('button', { type: 'button', 'aria-pressed': String(v === topic), onclick: () => { ui.newsTopic = v; refresh(); } }, label)))),
      rows.length ? el('ul', { class: 'newslist' }, rows.map(i => newsLine(i, true)))
        : el('p', { class: 'empty' }, topic === 'watchlist' ? (wl.items.length ? 'No recent headlines name a company on your watchlist.' : 'Your watchlist is empty. Add companies with the ☆ to see headlines that mention them.') : 'No headlines.'));
    return root;
  }
  const companyRow = c => el('tr', {},
    el('td', { class: 'starcell' }, star(c.name, c.key)),
    el('td', { class: 'name' }, companyLink(c), tag(c)),
    el('td', { class: 'num' }, fmt(sum(c.tx))),
    el('td', { class: 'num hide-sm' }, fmt(sum(c.tx.filter(isTw)))),
    el('td', { class: 'date' }, latest(c.tx)));
  const COMPANY_HEAD = [['', 'starcell'], ['Company'], ['Credits retired', 'num'], ['Tradewater credits', 'num hide-sm'], ['Last retired']];

  function searchView() {
    document.title = 'Tradewater Credit Tracker';
    const root = el('div');
    const input = search(ui.q, 'Company or developer name', v => { ui.q = v; draw(); }, 'big');
    root.append(el('h1', {}, 'Find a company or developer'),
      el('p', { class: 'sub' }, 'See every carbon credit retirement on a company\'s behalf, who retired it, and which developer sold it.'),
      input);
    const host = el('div');
    root.append(host);

    function draw() {
      const q = ui.q.trim().toLowerCase(), k = nameKey(ui.q);
      host.replaceChildren();
      if (!q) {
        const top = D.companies.filter(c => c.kind !== 'intermediary').slice(0, 6);
        const thisYear = D.companies.reduce((n, c) => n + sum(c.tx.filter(t => isTw(t) && c.kind !== 'intermediary' && inPeriod(t[0], 'year'))), 0);
        host.append(
          el('p', { class: 'chips' }, el('span', { class: 'muted' }, 'Try: '), top.map(c => el('button', { type: 'button', class: 'chip', onclick: () => { ui.q = c.name; refresh(); } }, c.name))),
          el('div', { class: 'tiles' },
            el('a', { class: 'tile', href: '#/customers' }, el('b', {}, 'Customers'), el('span', {}, `${fmt(thisYear)} Tradewater credits retired so far this year`)),
            el('a', { class: 'tile', href: '#/watchlist' }, el('b', {}, 'Watchlist'), el('span', {}, `${wl.items.length} watched${newCount() ? `, ${newCount()} new retirements` : ''}`)),
            el('a', { class: 'tile', href: '#/data' }, el('b', {}, 'Data'), el('span', {}, `Snapshot of ${snapshotDate}, ${daysOld(snapshotDate)} days old`))),
          newsWidget());
        return;
      }
      const cos = D.companies.filter(c => c.name.toLowerCase().includes(q) || (k && c.key.includes(k))).sort((a, z) => z.tx.length - a.tx.length);
      const devs = D.developers.filter(d => d.name.toLowerCase().includes(q));
      if (!cos.length && !devs.length) host.append(el('p', { class: 'empty' }, `Nothing found for "${ui.q.trim()}". It may not have retired these credit types, or the registry uses another name.`));
      if (cos.length) host.append(section(`Companies (${cos.length})`, table(COMPANY_HEAD, cos.slice(0, 15).map(companyRow), 'companies'),
        cos.length > 15 ? el('p', { class: 'muted' }, 'First 15 shown. Type more to narrow.') : null));
      if (devs.length) host.append(section(`Developers (${devs.length})`,
        table([['Developer'], ['Credits retired', 'num'], ['Customers', 'num hide-sm'], ['Last retired']],
          devs.slice(0, 10).map(d => el('tr', {}, el('td', { class: 'name' }, link('#/developer/' + D.developers.indexOf(d), d.name)),
            el('td', { class: 'num' }, fmt(d.total)), el('td', { class: 'num hide-sm' }, d.customers.length), el('td', { class: 'date' }, d.last))), 'developers')));
      if (k && !companyByKey(k)) host.append(el('p', { class: 'actionline' }, btn(`☆ Watch "${ui.q.trim()}" anyway`, () => { addWatch(ui.q, k); location.hash = '#/watchlist'; }),
        el('span', { class: 'muted' }, ' It shows up on the watchlist if it appears after a data refresh.')));
    }
    draw();
    if (!ui.q) setTimeout(() => input.focus(), 0);
    return root;
  }

  // ---------- Customers ----------
  const PERIODS = [['month', 'This month'], ['quarter', 'This quarter'], ['year', 'This year'], ['all', 'All time']];
  function inPeriod(date, period) {
    if (period === 'all') return true;
    const now = today();
    if (!date || date.slice(0, 4) !== now.slice(0, 4)) return false;
    if (period === 'year') return true;
    if (period === 'month') return date.slice(0, 7) === now.slice(0, 7);
    return Math.floor((+date.slice(5, 7) - 1) / 3) === Math.floor((+now.slice(5, 7) - 1) / 3);
  }

  function customersView() {
    document.title = 'Customers | Tradewater Credit Tracker';
    const twRows = [];
    D.companies.forEach(c => c.tx.filter(isTw).forEach(t => twRows.push({ company: c, t })));
    const lastDate = latest(twRows.map(r => r.t));

    const root = el('div');
    root.append(el('h1', {}, 'Customers'),
      el('p', { class: 'sub' }, 'Companies that Tradewater credits were retired for.'),
      hint('About this list', `Only credits with a company named in the registry are listed: ${fmt(sum(twRows.map(r => r.t)))} of ${fmt(D.coverage.total)}. ` +
        `${fmt(D.coverage.unnamed)} have no name and ${fmt(D.coverage.tradewaterOwn)} were retired from Tradewater's own account. ` +
        `The newest retirement in the data is ${lastDate}, so a period after that date is empty until the data updates.`),
      facts(['month', 'quarter', 'year', 'all'].map(p => {
        const rows = twRows.filter(r => inPeriod(r.t[0], p) && r.company.kind !== 'intermediary');
        return [fmt(sum(rows.map(r => r.t))), `${PERIODS.find(x => x[0] === p)[1]}, ${new Set(rows.map(r => r.company.id)).size} companies`];
      })));

    const host = el('div');
    root.append(el('div', { class: 'toolbar' }, seg(PERIODS, ui.period, v => { ui.period = v; refresh(); }),
      search(ui.cq, 'Filter by name', v => { ui.cq = v; draw(); })), host);

    function draw() {
      const q = ui.cq.trim().toLowerCase();
      const rows = [];
      D.companies.forEach(c => {
        if (c.kind === 'intermediary' || (q && !c.name.toLowerCase().includes(q))) return;
        const tx = c.tx.filter(t => isTw(t) && inPeriod(t[0], ui.period));
        if (tx.length) rows.push({ c, tx });
      });
      rows.sort((a, z) => sum(z.tx) - sum(a.tx));
      host.replaceChildren();
      if (!rows.length) host.append(el('p', { class: 'empty' }, `No retirements in this period${q ? ' for that name' : ''}.` + (ui.period !== 'all' ? ' Try All time.' : '')));
      else host.append(table([['', 'starcell'], ['Company'], ['Credits', 'num'], ['Retirements', 'num hide-sm'], ['Last retired'], ['Through an intermediary', 'hide-sm']],
        rows.map(({ c, tx }) => el('tr', {},
          el('td', { class: 'starcell' }, star(c.name, c.key)),
          el('td', { class: 'name' }, companyLink(c), tag(c)),
          el('td', { class: 'num' }, fmt(sum(tx))), el('td', { class: 'num hide-sm' }, tx.length),
          el('td', { class: 'date' }, latest(tx)),
          el('td', { class: 'hide-sm' }, [...new Set(tx.map(t => t[5]).filter(Boolean))].join(', ') || '–'))), 'customers'));
      host.append(intermediaries());
    }

    // Those that retired Tradewater credits themselves, plus those named on a customer's retirement
    function intermediaries() {
      const mids = new Map();
      const get = (key, name) => { let m = mids.get(key); if (!m) { m = { name, credits: 0, last: '', customers: new Map() }; mids.set(key, m); } return m; };
      D.companies.forEach(c => c.tx.filter(t => isTw(t) && inPeriod(t[0], ui.period)).forEach(t => {
        if (c.kind === 'intermediary') { const m = get(c.key, c.name); m.credits += t[1]; if (t[0] > m.last) m.last = t[0]; }
        if (t[5]) { const m = get(nameKey(t[5]), t[5]); m.credits += t[1]; if (t[0] > m.last) m.last = t[0]; m.customers.set(c.id, c.name); }
      }));
      return section('Intermediaries',
        hint('About intermediaries', 'Marketplaces, traders and programs that retired Tradewater credits. A registry record usually names the intermediary or the end customer, rarely both, so the last column is often empty. The labels are my judgment (scripts/intermediaries.json).'),
        mids.size ? table([['Intermediary'], ['Credits', 'num'], ['Last retired'], ['Retired for']],
          [...mids.entries()].sort((a, z) => z[1].credits - a[1].credits).map(([key, m]) => {
            const c = companyByKey(key);
            return el('tr', {}, el('td', { class: 'name' }, c ? companyLink(c) : m.name), el('td', { class: 'num' }, fmt(m.credits)), el('td', { class: 'date' }, m.last),
              el('td', {}, m.customers.size ? [...m.customers.entries()].map(([id, name], i) => [i ? ', ' : '', link('#/company/' + encodeURIComponent(id), name)]) : el('span', { class: 'muted' }, 'none named')));
          }), 'intermediaries') : el('p', { class: 'empty' }, 'No intermediaries in this period.'));
    }
    draw();
    return root;
  }

  // ---------- Company page ----------
  function companyView(id) {
    const c = companyById(id);
    if (!c) return el('div', {}, link('#/', '← Search'), el('p', { class: 'empty' }, 'Company not found.'));
    document.title = c.name + ' | Tradewater Credit Tracker';
    const tx = c.tx.map(t => ({ company: c, t }));
    const mine = tx.filter(r => isTw(r.t)), others = tx.filter(r => !isTw(r.t));
    const mids = new Map();
    c.tx.forEach(t => { if (t[5]) { const m = mids.get(t[5]) || { credits: 0, last: '' }; m.credits += t[1]; if (t[0] > m.last) m.last = t[0]; mids.set(t[5], m); } });
    const slug = c.id;

    const root = el('div');
    root.append(link('#/', '← Search'),
      el('div', { class: 'titlerow' }, el('h1', {}, c.name, tag(c)), watchButton(c.name, c.key)),
      el('p', { class: 'sub' }, `${c.tx.length} retirements, ${c.tx[c.tx.length - 1][0]} to ${c.tx[0][0]}.`),
      facts([[fmt(sum(c.tx)), 'credits retired'], [fmt(sum(mine.map(r => r.t))), 'Tradewater credits'], [fmt(sum(others.map(r => r.t))), 'other developers\' credits']]));
    if (mids.size) root.append(section('Intermediaries', table([['Intermediary'], ['Credits', 'num'], ['Last retired']],
      [...mids.entries()].sort((a, z) => z[1].credits - a[1].credits).map(([n, m]) => el('tr', {}, el('td', {}, n), el('td', { class: 'num' }, fmt(m.credits)), el('td', { class: 'date' }, m.last))), slug + '-intermediaries')));
    else root.append(section('Intermediaries', el('p', { class: 'empty' }, 'None named on this company\'s retirements.')));
    root.append(section(`Tradewater retirements (${mine.length})`, retirements(mine, slug + '-tradewater')),
      section(`Other developers' retirements (${others.length})`, retirements(others, slug + '-other-developers')));
    return root;
  }

  // ---------- Developer page ----------
  function developerView(id) {
    const d = D.developers[+id];
    if (!d) return el('div', {}, link('#/', '← Search'), el('p', { class: 'empty' }, 'Developer not found.'));
    document.title = d.name + ' | Tradewater Credit Tracker';
    const nameLink = n => { const c = companyByKey(nameKey(n)); return c ? companyLink({ id: c.id, name: n }) : n; };
    const list = (title, rows, empty, name) => section(`${title} (${rows.length})`, rows.length
      ? table([['Name'], ['Credits', 'num'], ['Retirements', 'num hide-sm'], ['Last retired']],
        rows.map(([n, q, count, last]) => el('tr', {}, el('td', { class: 'name' }, nameLink(n)), el('td', { class: 'num' }, fmt(q)), el('td', { class: 'num hide-sm' }, count), el('td', { class: 'date' }, last))), name)
      : el('p', { class: 'empty' }, empty));
    const root = el('div');
    root.append(link('#/', '← Search'), el('h1', {}, d.name),
      el('p', { class: 'sub' }, `${d.projects} project${d.projects === 1 ? '' : 's'}, ${fmt(d.total)} credits retired for named customers, last on ${d.last}.`),
      hint('About developer names', 'The registry names a developer for only some projects. Where it is blank, the project name is used with any trailing year or version removed, so one company can appear under more than one name.'),
      list('Customers', d.customers, 'No named customers.', 'developer-customers'),
      list('Intermediaries', d.intermediaries, 'No intermediaries found in the registry records.', 'developer-intermediaries'));
    return root;
  }

  // ---------- Watchlist ----------
  function addMany(text) {
    const names = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    let added = 0, dupes = 0; const unmatched = [];
    names.forEach(n => {
      const c = resolve(n);
      const ok = c ? addWatch(c.name, c.key) : addWatch(n, nameKey(n));
      if (ok) { added++; if (!c) unmatched.push(n); } else dupes++;
    });
    return names.length ? `Added ${added}${dupes ? `, ${dupes} already on the list` : ''}.` + (unmatched.length ? ` Not in the data yet (watched anyway): ${unmatched.join(', ')}.` : '') : '';
  }

  function watchlistView() {
    document.title = 'Watchlist | Tradewater Credit Tracker';
    const root = el('div');
    const all = [];
    wl.items.forEach(item => {
      const c = companyByKey(item.key), fresh = newIndexes(item);
      (c ? c.tx : []).forEach((t, i) => all.push({ company: c, t, isNew: fresh.has(i) }));
    });
    const nNew = all.filter(r => r.isNew).length;
    root.append(el('h1', {}, 'Watchlist'),
      el('p', { class: 'sub' }, wl.items.length
        ? `${wl.items.length} watched. ` + (nNew ? `${nNew} new retirement${nNew === 1 ? '' : 's'} since your last visit.` : 'No new retirements since your last visit.')
        : 'Watch the companies Tradewater is targeting. Use the ☆ next to any company, or paste names below.'),
      hint('How alerts work', `New means a retirement that was not in the data when you last opened this tab. The data changes only when CarbonPlan publishes a new snapshot (now ${snapshotDate}). The alert shows on the Watchlist tab only while this site is open. Nothing is emailed. The list is saved in this browser only.`));

    const box = el('textarea', { rows: 3, placeholder: 'Paste company names, one per line or separated by commas', 'aria-label': 'Company names to watch' });
    const addBtn = btn('Add to watchlist', () => { ui.flash = addMany(box.value); refresh(); }, 'primary');
    root.append(el('div', { class: 'pastebox' }, box, addBtn), ui.flash ? el('p', { class: 'flash' }, ui.flash) : null);
    ui.flash = '';

    if (wl.items.length) {
      root.append(section('Companies', table([['Company'], ['Retirements', 'num'], ['Credits', 'num'], ['Last retired'], ['']],
        wl.items.map(item => {
          const c = companyByKey(item.key), n = newIndexes(item).size;
          return el('tr', {},
            el('td', { class: 'name' }, c ? companyLink(c) : item.name, n ? el('span', { class: 'tag warn' }, n + ' new') : null),
            el('td', { class: 'num' }, c ? c.tx.length : 0), el('td', { class: 'num' }, c ? fmt(sum(c.tx)) : '0'),
            el('td', { class: 'date' }, c ? latest(c.tx) : 'none in the data'),
            el('td', { class: 'row-actions' }, btn('Remove', () => { removeWatch(item.key); refresh(); }, 'small')));
        }), 'watchlist-companies')),
        section('All retirements, newest first', retirements(all.sort((a, z) => z.t[0].localeCompare(a.t[0])), 'watchlist-retirements', { withCompany: true, showNew: true })));
    }
    markSeen();
    return root;
  }

  // ---------- AI (asks Claude through the /api/ask function, which holds the key) ----------
  const CODE_KEY = 'tradewater-ai-code';
  const ai = { q: '', busy: false, turns: [], error: '', needCode: false };   // turns: { q, a, sources }
  const AI_EXAMPLES = [
    'Who are the best prospects to contact first, and why?',
    'Which customers buy every year, and which have gone quiet?',
    'Which competitors sell to the same customers as Tradewater?',
    'What does the latest market news mean for selling our credits?',
  ];
  const yearTotals = tx => { const m = {}; tx.forEach(t => { const y = (t[0] || 'unknown').slice(0, 4); m[y] = (m[y] || 0) + t[1]; }); return Object.keys(m).sort().map(y => `${y}: ${fmt(m[y])}`).join('; '); };
  const readCode = () => { try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; } };
  const saveCode = v => { try { localStorage.setItem(CODE_KEY, v); } catch (e) { /* ignore */ } };
  const mentioned = (qKey, key) => key.length >= 3 && (' ' + qKey + ' ').includes(' ' + key + ' ');

  // Picks the data that fits the question. Returns { text, sources } where sources says what was sent.
  function aiContext(question) {
    const qKey = nameKey(question), lower = question.toLowerCase();
    const parts = [`Today is ${today()}. The registry data is a snapshot of ${snapshotDate}.`], sources = [];
    const rows = D.companies.filter(c => c.kind !== 'intermediary').map(c => ({ c, tx: c.tx.filter(isTw) })).filter(r => r.tx.length).sort((a, z) => sum(z.tx) - sum(a.tx));
    parts.push('## Tradewater customers (companies named on Tradewater credit retirements)\ncompany | kind | Tradewater credits | retirements | first | last | credits by year | intermediaries named\n' +
      rows.map(({ c, tx }) => [c.name, c.kind, sum(tx), tx.length, tx[tx.length - 1][0], tx[0][0], yearTotals(tx), [...new Set(tx.map(t => t[5]).filter(Boolean))].join(', ') || 'none'].join(' | ')).join('\n') +
      `\nCoverage: ${D.coverage.unnamed} of ${D.coverage.total} Tradewater credits have no company named and ${D.coverage.tradewaterOwn} were retired from Tradewater's own account, so they are not listed.`);
    const mids = D.companies.filter(c => c.kind === 'intermediary').map(c => [c.name, sum(c.tx.filter(isTw)), latest(c.tx.filter(isTw))]).filter(m => m[1]);
    if (mids.length) parts.push('## Intermediaries that retired Tradewater credits\nname | Tradewater credits | last\n' + mids.sort((a, z) => z[1] - a[1]).map(m => m.join(' | ')).join('\n'));
    sources.push('Tradewater customers and intermediaries');

    D.companies.filter(c => mentioned(qKey, c.key)).slice(0, 3).forEach(c => {
      parts.push(`## Every recorded retirement for ${c.name}\ndate | credits | project | vintage | developer | intermediary | registry note\n` + c.tx.slice(0, 150).map(t => [t[0], t[1], t[2], t[3], t[4], t[5] || 'none', t[6]].join(' | ')).join('\n'));
      sources.push(`${c.name}'s retirements`);
    });
    const named = D.developers.filter(d => mentioned(qKey, nameKey(d.name)));
    const wantDevs = named.length || /competitor|developer|rival|a-gas|compete|sell to the same/.test(lower);
    if (wantDevs) {
      const list = named.length ? named.slice(0, 3) : D.developers.slice(0, 15);
      parts.push('## Competing project developers' + (named.length ? '' : ' (top 15 by credits retired)') + '\n' +
        list.map(d => `${d.name}: ${d.projects} projects, ${d.total} credits retired, last ${d.last}\n  customers: ${d.customers.slice(0, 15).map(r => `${r[0]} (${r[1]})`).join('; ') || 'none'}\n  intermediaries: ${d.intermediaries.slice(0, 10).map(r => `${r[0]} (${r[1]})`).join('; ') || 'none'}`).join('\n'));
      sources.push(named.length ? named.slice(0, 3).map(d => d.name).join(', ') + ' (competitor data)' : 'Top competing developers');
    }
    if (NEWS.items.length && /news|market|price|trend|headline|policy|regulat|demand|outlook|corsia|article 6|compliance|cap-and-trade|eu |uk /.test(lower)) {
      parts.push('## Recent carbon credit market headlines (headlines only, not full articles)\ndate | publisher | headline | topics\n' + NEWS.items.slice(0, 40).map(i => [i.date, i.source, i.title, i.topics.join(', ')].join(' | ')).join('\n'));
      sources.push('Recent market headlines');
    }
    return { text: parts.join('\n\n'), sources };
  }

  async function askAI(question) {
    const code = readCode();
    const { text, sources } = aiContext(question);
    const history = ai.turns.slice(-3).map(t => ({ q: t.q, a: t.a }));
    let res;
    try {
      res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, question, context: text, history }) });
    } catch (e) {
      return { error: 'Could not reach the AI. It only works on the live site, not from a file on your computer, and needs an internet connection.' };
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* not JSON, handled below */ }
    if (res.status === 401) return { needCode: true, error: data.error || 'Enter the access code.' };
    if (res.status === 404) return { error: 'The AI is not part of this version of the site yet. It needs the Netlify function deployed.' };
    if (!res.ok || !data.answer) return { error: data.error || `The AI request failed (${res.status}). If the answer takes more than about ten seconds, the host may be cutting it off. Try a shorter question.` };
    return { answer: data.answer, sources, truncated: data.truncated, refused: data.refused };
  }

  function aiView() {
    document.title = 'AI | Tradewater Credit Tracker';
    const root = el('div');
    root.append(el('h1', {}, 'Ask AI'),
      el('p', { class: 'sub' }, 'Ask about customers, prospects, competitors or the market. It answers from this site\'s data.'),
      hint('How it works', 'Your question and the matching data (customers, any company or developer you name, and headlines when you ask about the market) go to Claude through a small server function. The answer is based only on that data, and it should say when the data cannot answer. Check what it tells you against the tables, especially numbers. Nothing is stored except a count of questions per day.'));

    const q = el('textarea', { rows: 3, placeholder: 'For example: which customers have gone quiet this year?', 'aria-label': 'Your question', disabled: ai.busy || null });
    q.value = ai.q;
    q.addEventListener('input', () => { ai.q = q.value; });
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); });
    const code = el('input', { type: 'password', placeholder: 'Access code', 'aria-label': 'Access code', value: readCode(), autocomplete: 'off' });
    code.addEventListener('change', () => saveCode(code.value.trim()));

    async function go() {
      const question = ai.q.trim();
      if (!question || ai.busy) return;
      saveCode(code.value.trim());
      ai.busy = true; ai.error = ''; ai.needCode = false; refresh();
      const r = await askAI(question);
      ai.busy = false;
      if (r.answer) { ai.turns.push({ q: question, a: r.answer, sources: r.sources, truncated: r.truncated, refused: r.refused }); ai.q = ''; }
      else { ai.error = r.error; ai.needCode = !!r.needCode; }
      refresh();
    }

    root.append(
      el('label', { class: 'field' }, el('span', {}, 'Your question'), q),
      el('div', { class: 'toolbar' },
        btn(ai.busy ? 'Thinking…' : 'Ask', go, 'primary'),
        readCode() && !ai.needCode ? null : el('label', { class: 'inlinelabel' }, 'Access code', code),
        ai.turns.length ? btn('Start over', () => { ai.turns = []; ai.error = ''; refresh(); }, 'small') : null),
      ai.error ? el('p', { class: 'flash' }, ai.error) : null,
      ai.turns.length ? null : el('p', { class: 'chips' }, el('span', { class: 'muted' }, 'Try: '), AI_EXAMPLES.map(x => el('button', { type: 'button', class: 'chip', onclick: () => { ai.q = x; refresh(); } }, x))));

    [...ai.turns].reverse().forEach(t => root.append(el('section', { class: 'answer' },
      el('p', { class: 'asked' }, t.q),
      el('div', { class: 'answertext' }, t.a),
      t.truncated ? el('p', { class: 'muted' }, 'The answer was cut off. Ask a narrower question.') : null,
      el('p', { class: 'muted' }, 'Based on: ' + t.sources.join('; ') + '. AI can make mistakes, so check numbers against the tables.'))));
    return root;
  }

  // ---------- Data (sources and freshness) ----------
  function dataView() {
    document.title = 'Data | Tradewater Credit Tracker';
    const age = daysOld(snapshotDate);
    const root = el('div');
    root.append(el('h1', {}, 'Data'),
      el('p', { class: 'sub' }, `One source, CarbonPlan OffsetsDB, built from public registry records. Snapshot of ${snapshotDate}, ${age} days old.`),
      section('Source', table([['Source'], ['Link'], ['Snapshot date'], ['Age', 'num']], [el('tr', {},
        el('td', {}, 'CarbonPlan OffsetsDB'),
        el('td', {}, el('a', { href: 'https://carbonplan.org/research/offsets-db', target: '_blank', rel: 'noopener' }, 'carbonplan.org/research/offsets-db'), ' · ', el('a', { href: 'https://carbonplan.org/terms', target: '_blank', rel: 'noopener' }, 'terms')),
        el('td', { class: 'date' }, snapshotDate), el('td', { class: 'num' }, age + ' days'))], 'source'),
        hint('How often it updates', 'A GitHub job checks CarbonPlan every day and rebuilds this site only when CarbonPlan has published a new file. CarbonPlan updates when it chooses, so the snapshot can be months old.')),
      section('Registries', table([['Registry'], ['Link'], ['Projects', 'num hide-sm'], ['Retirements used', 'num hide-sm'], ['Latest retirement'], ['Age', 'num']],
        D.registries.map(r => el('tr', {}, el('td', {}, r.name),
          el('td', {}, r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.url.replace(/^https?:\/\//, '')) : '–'),
          el('td', { class: 'num hide-sm' }, r.projects), el('td', { class: 'num hide-sm' }, fmt(r.retirements)),
          el('td', { class: 'date' }, r.latestRetirement), el('td', { class: 'num' }, daysOld(r.latestRetirement) + ' days'))), 'registries'),
        hint('About registry freshness', 'Latest retirement is the newest retirement dated in that registry anywhere in the snapshot, which shows how current its records are. Only registries that hold Tradewater-type projects are listed.')),
      section('What is covered', el('ul', { class: 'plain' },
        el('li', {}, `Project types: ${D.types.join(', ')}. Retirements on other types are not here.`),
        el('li', {}, `${D.projects.length} Tradewater projects: "Tradewater" in the project name or developer, plus IDs in scripts/extra-tradewater-projects.json.`),
        el('li', {}, `A retirement's company is the beneficiary if recorded, otherwise the registry account holder. ${Math.round(D.coverage.unnamed / D.coverage.total * 100)}% of Tradewater credits have neither.`),
        el('li', {}, 'A retirement is a credit used by a buyer, not a sale by Tradewater.'))));
    return root;
  }

  // ---------- router ----------
  const PAGES = {
    '': ['search', searchView], company: ['search', companyView], developer: ['search', developerView],
    customers: ['customers', customersView], watchlist: ['watchlist', watchlistView], news: ['news', newsView], ai: ['ai', aiView], data: ['data', dataView],
  };
  function route(keepScroll) {
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    let arg = parts.slice(1).join('/');
    try { arg = decodeURIComponent(arg); } catch (e) { /* keep the raw text */ }
    const [tab, fn] = PAGES[parts[0]] || PAGES[''];
    let node;
    try { node = fn(arg); } catch (err) {
      console.error(err);
      node = el('div', {}, el('h1', {}, 'Something went wrong'), el('p', { class: 'empty' }, 'This page could not be drawn. Go to Search and try again.'));
    }
    document.querySelectorAll('header [data-s]').forEach(a => {
      if (a.getAttribute('data-s') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const n = newCount();
    document.querySelector('header [data-s="watchlist"]').textContent = n ? `Watchlist (${n} new)` : 'Watchlist';
    document.getElementById('source').textContent = `Data: ${D.source}, snapshot of ${snapshotDate}`;
    document.getElementById('foot').textContent = 'Public registry records, provided as is. A "retirement" is a credit used by a buyer, not a sale by Tradewater. Your watchlist is saved in this browser only.';
    const y = window.scrollY;
    view.replaceChildren(node);
    window.scrollTo(0, keepScroll === true ? y : 0);
  }
  window.TWKit.refresh = () => route(true);
  window.addEventListener('hashchange', () => route());
  route();
})();
