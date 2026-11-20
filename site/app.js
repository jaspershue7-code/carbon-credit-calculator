// Five pages: Customers, Companies, Watchlist, Competitors, Data. All numbers come from site/data.js.
(function () {
  const D = window.TW_DATA;
  const { fmt, el, btn, today } = window.TWKit;
  const view = document.getElementById('view');

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
  const KIND = { intermediary: 'Intermediary', account: 'Registry account holder' };
  const tag = c => (KIND[c.kind] ? el('span', { class: 'tag' }, KIND[c.kind]) : null);
  const daysOld = d => Math.round((Date.parse(today()) - Date.parse(d)) / 86400000);
  const snapshotDate = D.generatedAt.slice(0, 10);

  const search = (value, placeholder, oninput) => {
    const i = el('input', { type: 'search', placeholder, value, 'aria-label': placeholder });
    i.addEventListener('input', () => oninput(i.value));
    return i;
  };
  const facts = items => el('ul', { class: 'facts' }, items.map(([v, label]) => el('li', {}, el('b', {}, v), el('span', {}, label))));
  const table = (head, body) => el('div', { class: 'scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, head.map(([label, cls]) => el('th', { class: cls || '' }, label)))),
    el('tbody', {}, body)));
  const link = (href, text) => el('a', { href }, text);

  // Retirement table. rows: [{ company, t, isNew }]
  function retirements(rows, { withCompany = false, showNew = false } = {}) {
    if (!rows.length) return el('p', { class: 'empty' }, 'No retirements.');
    const head = [['Date'], ...(withCompany ? [['Company']] : []), ['Credits', 'num'], ['Developer'], ['Intermediary', 'hide-sm'], ['Project'], ['Registry note', 'hide-sm']];
    return table(head, rows.map(({ company, t, isNew }) => el('tr', {},
      el('td', { class: 'date' }, t[0] || 'unknown', showNew && isNew ? el('span', { class: 'tag warn' }, 'New') : null),
      withCompany ? el('td', { class: 'name' }, link('#/company/' + encodeURIComponent(company.id), company.name)) : null,
      el('td', { class: 'num' }, fmt(t[1])),
      el('td', {}, t[4]),
      el('td', { class: 'hide-sm' }, t[5] || '–'),
      el('td', {}, projLink(t[2]), t[3] ? el('span', { class: 'muted' }, ` (vintage ${t[3]})`) : null),
      el('td', { class: 'hide-sm muted' }, t[6]))));
  }

  // ---------- watchlist storage (this browser only) ----------
  const WKEY = 'tradewater-watchlist-v1';
  let wl = { items: [] };
  try { const raw = localStorage.getItem(WKEY); if (raw) wl = JSON.parse(raw); } catch (e) { /* storage blocked: the list lasts until the tab closes */ }
  const saveWl = () => { try { localStorage.setItem(WKEY, JSON.stringify(wl)); } catch (e) { /* ignore */ } };
  const txKey = t => t.slice(0, 5).join('|');
  const seenMap = c => { const m = {}; (c ? c.tx : []).forEach(t => { const k = txKey(t); m[k] = (m[k] || 0) + 1; }); return m; };
  const isWatched = key => wl.items.some(i => i.key === key);
  function addWatch(name, key) {
    if (!key || isWatched(key)) return;
    const c = companyByKey(key);
    wl.items.push({ key, name: c ? c.name : name.trim(), seen: seenMap(c) });
    saveWl();
  }
  function removeWatch(key) { wl.items = wl.items.filter(i => i.key !== key); saveWl(); }

  // Retirements not seen at the last visit to the Watchlist page. Worked out once per page load, so they stay
  // highlighted while you look at them and are counted as seen for next time.
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
  function markSeen() {
    wl.items.forEach(i => { i.seen = seenMap(companyByKey(i.key)); });
    saveWl(); acknowledged = true;
  }
  const watchButton = (name, key) => {
    const on = isWatched(key);
    return btn(on ? 'Remove from watchlist' : 'Add to watchlist', () => { on ? removeWatch(key) : addWatch(name, key); window.TWKit.refresh(); }, on ? '' : 'primary');
  };

  // ---------- Customers ----------
  const cstate = { period: 'all', q: '' };
  const PERIODS = [['all', 'All time'], ['year', 'This year'], ['quarter', 'This quarter'], ['month', 'This month']];
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
    const twRows = [];   // every named Tradewater retirement with its company
    D.companies.forEach(c => c.tx.filter(isTw).forEach(t => twRows.push({ company: c, t })));
    const named = D.coverage.beneficiary + D.coverage.account;

    const root = el('div');
    root.append(
      el('h1', {}, 'Tradewater credits retired for companies'),
      el('p', { class: 'lede' }, `${fmt(sum(twRows.map(r => r.t)))} Tradewater credits have a company or account holder named in the registry record, out of ${fmt(D.coverage.total)} retired in total.`),
      el('p', { class: 'note' },
        `${fmt(D.coverage.unnamed)} credits have no name at all and ${fmt(D.coverage.tradewaterOwn)} were retired from Tradewater's own account, so they are not listed. ` +
        `The latest retirement in the data is ${latest(twRows.map(r => r.t)) || 'unknown'} (snapshot of ${snapshotDate}), so "this month" is empty until the data catches up.`));

    root.append(facts(PERIODS.map(([p, label]) => {
      const rows = twRows.filter(r => inPeriod(r.t[0], p) && r.company.kind !== 'intermediary');
      return [fmt(sum(rows.map(r => r.t))), `${label} (${new Set(rows.map(r => r.company.id)).size} companies)`];
    })));

    const period = el('select', { 'aria-label': 'Period' }, PERIODS.map(([v, l]) => el('option', { value: v }, l)));
    period.value = cstate.period;
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Period', period),
      el('label', { class: 'grow' }, 'Search', search(cstate.q, 'Company name', v => { cstate.q = v; draw(); }))));
    const host = el('div');
    root.append(host);

    function draw() {
      const q = cstate.q.trim().toLowerCase();
      const rows = [];
      D.companies.forEach(c => {
        if (c.kind === 'intermediary' || (q && !c.name.toLowerCase().includes(q))) return;
        const tx = c.tx.filter(t => isTw(t) && inPeriod(t[0], cstate.period));
        if (tx.length) rows.push({ c, tx });
      });
      rows.sort((a, z) => sum(z.tx) - sum(a.tx));
      host.replaceChildren();
      if (!rows.length) { host.append(el('p', { class: 'empty' }, 'No retirements in this period.')); }
      else {
        host.append(
          table([['Company'], ['Credits', 'num'], ['Retirements', 'num hide-sm'], ['Last retired'], ['Through an intermediary', 'hide-sm']],
            rows.map(({ c, tx }) => el('tr', {},
              el('td', { class: 'name' }, link('#/company/' + encodeURIComponent(c.id), c.name), tag(c)),
              el('td', { class: 'num' }, fmt(sum(tx))),
              el('td', { class: 'num hide-sm' }, tx.length),
              el('td', { class: 'date' }, latest(tx)),
              el('td', { class: 'hide-sm' }, [...new Set(tx.map(t => t[5]).filter(Boolean))].join(', ') || '–')))),
          el('p', { class: 'muted' }, `${rows.length} companies`));
      }
      drawIntermediaries();
    }

    // Intermediaries: those that retired Tradewater credits themselves, plus those named on a customer's retirement
    const midHost = el('div');
    root.append(midHost);
    function drawIntermediaries() {
      const mids = new Map();
      const get = (key, name) => { let m = mids.get(key); if (!m) { m = { name, credits: 0, last: '', customers: new Map() }; mids.set(key, m); } return m; };
      D.companies.forEach(c => c.tx.filter(t => isTw(t) && inPeriod(t[0], cstate.period)).forEach(t => {
        if (c.kind === 'intermediary') { const m = get(c.key, c.name); m.credits += t[1]; if (t[0] > m.last) m.last = t[0]; }
        if (t[5]) {
          const m = get(nameKey(t[5]), t[5]); m.credits += t[1]; if (t[0] > m.last) m.last = t[0];
          m.customers.set(c.id, c.name);
        }
      }));
      midHost.replaceChildren(el('h2', {}, 'Intermediaries'),
        el('p', { class: 'note' }, 'Marketplaces, traders and programs that retired Tradewater credits. The registry usually names either the intermediary or the end customer, rarely both, so the customer column is often empty. Intermediary labels are my judgment, listed in scripts/intermediaries.json.'));
      if (!mids.size) { midHost.append(el('p', { class: 'empty' }, 'No intermediaries in this period.')); return; }
      midHost.append(table([['Intermediary'], ['Credits', 'num'], ['Last retired'], ['Customers named for']],
        [...mids.entries()].sort((a, z) => z[1].credits - a[1].credits).map(([key, m]) => {
          const c = companyByKey(key);
          return el('tr', {},
            el('td', { class: 'name' }, c ? link('#/company/' + encodeURIComponent(c.id), m.name) : m.name),
            el('td', { class: 'num' }, fmt(m.credits)),
            el('td', { class: 'date' }, m.last),
            el('td', {}, m.customers.size
              ? [...m.customers.entries()].map(([id, name], i) => [i ? ', ' : '', link('#/company/' + encodeURIComponent(id), name)])
              : el('span', { class: 'muted' }, 'none named')));
        })));
    }
    period.addEventListener('change', () => { cstate.period = period.value; draw(); });
    draw();
    return root;
  }

  // ---------- Companies (search any company, see its history) ----------
  const qstate = { q: '' };
  function companiesView() {
    document.title = 'Companies | Tradewater Credit Tracker';
    const root = el('div');
    root.append(el('h1', {}, 'Look up a company'),
      el('p', { class: 'lede' }, `Type the name of a target company to see every credit retirement on its behalf for ${D.types.join(', ')} projects, from Tradewater and from other developers, and which intermediary retired them.`),
      el('div', { class: 'controls' }, el('label', { class: 'grow' }, 'Company name', search(qstate.q, 'For example Shell', v => { qstate.q = v; draw(); }))));
    const host = el('div');
    root.append(host);
    function draw() {
      const q = qstate.q.trim().toLowerCase(), k = nameKey(qstate.q);
      host.replaceChildren();
      if (!q) { host.append(el('p', { class: 'muted' }, `${D.companies.length} companies in the data. Start typing to search.`)); return; }
      const rows = D.companies.filter(c => c.name.toLowerCase().includes(q) || (k && c.key.includes(k)))
        .sort((a, z) => z.tx.length - a.tx.length);
      if (!rows.length) {
        host.append(el('p', { class: 'empty' }, `No retirements found for "${qstate.q.trim()}" in this data. Either it has not retired credits of these types, or the registry record uses another name.`));
      } else {
        host.append(table([['Company'], ['Retirements', 'num'], ['Credits', 'num'], ['Last retired'], ['Tradewater credits', 'num hide-sm']],
          rows.slice(0, 50).map(c => el('tr', {},
            el('td', { class: 'name' }, link('#/company/' + encodeURIComponent(c.id), c.name), tag(c)),
            el('td', { class: 'num' }, c.tx.length), el('td', { class: 'num' }, fmt(sum(c.tx))),
            el('td', { class: 'date' }, latest(c.tx)), el('td', { class: 'num hide-sm' }, fmt(sum(c.tx.filter(isTw))))))),
          el('p', { class: 'muted' }, rows.length > 50 ? 'First 50 of ' + rows.length + ' shown. Type more to narrow.' : rows.length + ' shown'));
      }
      if (k && !companyByKey(k)) {
        host.append(el('p', {}, btn(`Add "${qstate.q.trim()}" to watchlist anyway`, () => { addWatch(qstate.q, k); location.hash = '#/watchlist'; }),
          el('span', { class: 'muted' }, ' It will show up on the watchlist if it appears after a data refresh.')));
      }
    }
    draw();
    return root;
  }

  function companyView(id) {
    const c = companyById(id);
    if (!c) return el('div', {}, link('#/companies', '← Companies'), el('p', { class: 'empty' }, 'Company not found.'));
    document.title = c.name + ' | Tradewater Credit Tracker';
    const tx = c.tx.map(t => ({ company: c, t }));
    const mine = tx.filter(r => isTw(r.t)), others = tx.filter(r => !isTw(r.t));
    const mids = new Map();
    c.tx.forEach(t => { if (t[5]) { const m = mids.get(t[5]) || { credits: 0, last: '' }; m.credits += t[1]; if (t[0] > m.last) m.last = t[0]; mids.set(t[5], m); } });

    const root = el('div');
    root.append(link('#/companies', '← Companies'), el('h1', {}, c.name), tag(c) || '',
      el('p', { class: 'lede' }, `${fmt(sum(c.tx))} credits retired in ${c.tx.length} retirements, ${c.tx[c.tx.length - 1][0]} to ${c.tx[0][0]}.`),
      el('p', {}, watchButton(c.name, c.key)),
      facts([[fmt(sum(mine.map(r => r.t))), 'Tradewater credits'], [fmt(sum(others.map(r => r.t))), 'Other developers\' credits'], [latest(c.tx) || 'unknown', 'last retirement']]));
    root.append(el('h2', {}, 'Intermediaries'));
    if (mids.size) {
      root.append(table([['Intermediary'], ['Credits', 'num'], ['Last retired']],
        [...mids.entries()].sort((a, z) => z[1].credits - a[1].credits).map(([n, m]) => el('tr', {}, el('td', {}, n), el('td', { class: 'num' }, fmt(m.credits)), el('td', { class: 'date' }, m.last)))));
    } else root.append(el('p', { class: 'empty' }, 'No intermediary is named on this company\'s retirements.'));
    root.append(el('h2', {}, `Tradewater retirements (${mine.length})`), retirements(mine),
      el('h2', {}, `Other developers' retirements (${others.length})`), retirements(others));
    return root;
  }

  // ---------- Watchlist ----------
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
      el('p', { class: 'lede' }, wl.items.length
        ? `${wl.items.length} companies watched. ${nNew ? nNew + ' new retirement' + (nNew === 1 ? '' : 's') + ' since your last visit.' : 'No new retirements since your last visit.'}`
        : 'Add the companies Tradewater is targeting. This page shows every retirement on their behalf and flags new ones.'),
      el('p', { class: 'note' }, `New means a retirement that was not in the data when you last opened this page. The data changes only when CarbonPlan publishes a new snapshot (currently ${snapshotDate}), and a notice appears here and on the nav link only while this site is open. Nothing is emailed. The list is saved in this browser only.`));

    const input = el('input', { type: 'text', list: 'company-names', placeholder: 'Company name', 'aria-label': 'Company name' });
    const dl = el('datalist', { id: 'company-names' }, D.companies.map(c => el('option', { value: c.name })));
    const add = () => { const v = input.value.trim(); if (!v) return; const k = nameKey(v); const c = D.companies.find(x => x.name.toLowerCase() === v.toLowerCase()) || companyByKey(k); addWatch(v, c ? c.key : k); window.TWKit.refresh(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    root.append(el('div', { class: 'controls' }, el('label', { class: 'grow' }, 'Add a company', input, dl), el('label', {}, ' ', btn('Add', add, 'primary'))));

    if (wl.items.length) {
      root.append(el('h2', {}, 'Companies'),
        table([['Company'], ['Retirements', 'num'], ['Credits', 'num'], ['Last retired'], ['']],
          wl.items.map(item => {
            const c = companyByKey(item.key);
            return el('tr', {},
              el('td', { class: 'name' }, c ? link('#/company/' + encodeURIComponent(c.id), c.name) : item.name,
                newIndexes(item).size ? el('span', { class: 'tag warn' }, newIndexes(item).size + ' new') : null),
              el('td', { class: 'num' }, c ? c.tx.length : 0), el('td', { class: 'num' }, c ? fmt(sum(c.tx)) : '0'),
              el('td', { class: 'date' }, c ? latest(c.tx) : 'none in the data'),
              el('td', { class: 'row-actions' }, btn('Remove', () => { removeWatch(item.key); window.TWKit.refresh(); }, 'small')));
          })),
        el('h2', {}, 'All retirements, newest first'),
        retirements(all.sort((a, z) => z.t[0].localeCompare(a.t[0])), { withCompany: true, showNew: true }));
    }
    markSeen();
    return root;
  }

  // ---------- Competitors (other project developers) ----------
  const dstate = { q: '' };
  const devId = d => D.developers.indexOf(d);
  function competitorsView() {
    document.title = 'Competitors | Tradewater Credit Tracker';
    const root = el('div');
    root.append(el('h1', {}, 'Look up a competing developer'),
      el('p', { class: 'lede' }, `${D.developers.length} other developers have ${D.types.join(', ')} projects in the data. Pick one to see its customers and the intermediaries it works with.`),
      el('p', { class: 'note' }, 'The registry data has a developer name for only some projects. Where it is blank, the project name is used with any trailing year or version removed, so one company can appear under more than one name (for example Hudson Technologies and "HT").'),
      el('div', { class: 'controls' }, el('label', { class: 'grow' }, 'Developer name', search(dstate.q, 'For example A-Gas', v => { dstate.q = v; draw(); }))));
    const host = el('div');
    root.append(host);
    function draw() {
      const q = dstate.q.trim().toLowerCase();
      const rows = D.developers.filter(d => !q || d.name.toLowerCase().includes(q));
      host.replaceChildren();
      if (!rows.length) { host.append(el('p', { class: 'empty' }, 'No developer matches.')); return; }
      host.append(table([['Developer'], ['Projects', 'num hide-sm'], ['Credits retired', 'num'], ['Customers', 'num hide-sm'], ['Intermediaries', 'num hide-sm'], ['Last retired']],
        rows.map(d => el('tr', {},
          el('td', { class: 'name' }, link('#/developer/' + devId(d), d.name)),
          el('td', { class: 'num hide-sm' }, d.projects), el('td', { class: 'num' }, fmt(d.total)),
          el('td', { class: 'num hide-sm' }, d.customers.length), el('td', { class: 'num hide-sm' }, d.intermediaries.length),
          el('td', { class: 'date' }, d.last)))),
        el('p', { class: 'muted' }, rows.length + ' shown'));
    }
    draw();
    return root;
  }

  function developerView(id) {
    const d = D.developers[+id];
    if (!d) return el('div', {}, link('#/competitors', '← Competitors'), el('p', { class: 'empty' }, 'Developer not found.'));
    document.title = d.name + ' | Tradewater Credit Tracker';
    const nameLink = n => { const c = companyByKey(nameKey(n)); return c ? link('#/company/' + encodeURIComponent(c.id), n) : n; };
    const list = (title, rows, empty) => [el('h2', {}, `${title} (${rows.length})`),
      rows.length ? table([['Name'], ['Credits', 'num'], ['Retirements', 'num hide-sm'], ['Last retired']],
        rows.map(([n, q, count, last]) => el('tr', {}, el('td', { class: 'name' }, nameLink(n)), el('td', { class: 'num' }, fmt(q)), el('td', { class: 'num hide-sm' }, count), el('td', { class: 'date' }, last))))
        : el('p', { class: 'empty' }, empty)];
    const root = el('div');
    root.append(link('#/competitors', '← Competitors'), el('h1', {}, d.name),
      el('p', { class: 'lede' }, `${d.projects} project${d.projects === 1 ? '' : 's'}, ${fmt(d.total)} credits retired for named customers, last on ${d.last}.`),
      ...list('Customers', d.customers, 'No named customers.'),
      ...list('Intermediaries', d.intermediaries, 'No intermediaries found in the registry records.'));
    return root;
  }

  // ---------- Data (sources and freshness) ----------
  function dataView() {
    document.title = 'Data | Tradewater Credit Tracker';
    const age = daysOld(snapshotDate);
    const root = el('div');
    root.append(el('h1', {}, 'Where the data comes from'),
      el('p', { class: 'lede' }, `One source, CarbonPlan OffsetsDB, which collects public records from the carbon credit registries. The snapshot is dated ${snapshotDate}, ${age} days ago.`),
      el('h2', {}, 'Source'),
      table([['Source'], ['Link'], ['Snapshot date'], ['Age', 'num']], [el('tr', {},
        el('td', {}, 'CarbonPlan OffsetsDB'),
        el('td', {}, el('a', { href: 'https://carbonplan.org/research/offsets-db', target: '_blank', rel: 'noopener' }, 'carbonplan.org/research/offsets-db'), ' · ', el('a', { href: 'https://carbonplan.org/terms', target: '_blank', rel: 'noopener' }, 'terms')),
        el('td', { class: 'date' }, snapshotDate), el('td', { class: 'num' }, age + ' days'))]),
      el('p', { class: 'muted' }, 'A GitHub job checks CarbonPlan every day and rebuilds the site only when CarbonPlan has published a new file. CarbonPlan itself updates when it chooses, so the snapshot can be months old.'),
      el('h2', {}, 'Registries'),
      table([['Registry'], ['Link'], ['Projects covered', 'num hide-sm'], ['Retirements used', 'num hide-sm'], ['Latest retirement'], ['Age', 'num']],
        D.registries.map(r => el('tr', {},
          el('td', {}, r.name),
          el('td', {}, r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.url.replace(/^https?:\/\//, '')) : '–'),
          el('td', { class: 'num hide-sm' }, r.projects), el('td', { class: 'num hide-sm' }, fmt(r.retirements)),
          el('td', { class: 'date' }, r.latestRetirement), el('td', { class: 'num' }, daysOld(r.latestRetirement) + ' days')))),
      el('p', { class: 'muted' }, 'Latest retirement is the newest retirement dated in that registry anywhere in the snapshot. It shows how fresh each registry\'s records are. Only the three registries that hold Tradewater-type projects are listed.'),
      el('h2', {}, 'What is covered'),
      el('ul', { class: 'plain' },
        el('li', {}, `Project types: ${D.types.join(', ')}. Retirements on other project types are not in this tool.`),
        el('li', {}, `${D.projects.length} Tradewater projects, identified by "Tradewater" in the project name or developer, plus the IDs in scripts/extra-tradewater-projects.json.`),
        el('li', {}, `For each retirement the company is the beneficiary if one is recorded, otherwise the registry account holder. ${fmt(D.coverage.unnamed)} of ${fmt(D.coverage.total)} Tradewater credits (${Math.round(D.coverage.unnamed / D.coverage.total * 100)}%) have neither.`),
        el('li', {}, 'A retirement is a credit used by a buyer, not a sale by Tradewater.'),
        el('li', {}, 'Provided as is. Registries may have their own terms on this data.')));
    return root;
  }

  // ---------- router ----------
  const PAGES = {
    '': ['customers', customersView], companies: ['companies', companiesView], company: ['companies', companyView],
    watchlist: ['watchlist', watchlistView], competitors: ['competitors', competitorsView], developer: ['competitors', developerView],
    data: ['data', dataView],
  };
  function route(keepScroll) {
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    let arg = parts.slice(1).join('/');
    try { arg = decodeURIComponent(arg); } catch (e) { /* keep the raw text */ }
    const [section, fn] = PAGES[parts[0]] || PAGES[''];
    let node;
    try { node = fn(arg); } catch (err) {
      console.error(err);
      node = el('div', {}, el('h1', {}, 'Something went wrong'), el('p', { class: 'empty' }, 'This page could not be drawn. Go to Customers and try again.'));
    }
    document.querySelectorAll('header [data-s]').forEach(a => {
      if (a.getAttribute('data-s') === section) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const n = newCount();
    document.querySelector('header [data-s="watchlist"]').textContent = n ? `Watchlist (${n} new)` : 'Watchlist';
    document.getElementById('source').textContent = `${D.source}, snapshot of ${snapshotDate}`;
    document.getElementById('foot').textContent = 'Data: CarbonPlan OffsetsDB, from public carbon registry records. Provided as is. A "retirement" is a credit used by a buyer, not a sale by Tradewater. Your watchlist is saved in this browser only.';
    const y = window.scrollY;
    view.replaceChildren(node);
    window.scrollTo(0, keepScroll === true ? y : 0);
  }
  window.TWKit.refresh = () => route(true);
  window.addEventListener('hashchange', () => route());
  route();
})();
