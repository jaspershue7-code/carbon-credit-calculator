(function () {
  const D = window.TW_DATA;
  const view = document.getElementById('view');
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';

  // Small element helper. Text always goes in as text, never as HTML.
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }

  const KIND_LABEL = {
    intermediary: 'Likely marketplace or trader',
    account: 'Registry account holder',
    tradewater: 'Tradewater account',
    none: 'No buyer recorded',
  };
  const KIND_HELP = {
    intermediary: 'This looks like a marketplace, trader or program that resells credits (my guess from the name, not confirmed). Its customers are the real buyers.',
    account: 'The registry names this as the account that retired the credits, not as the beneficiary. It may be the end buyer or a middleman.',
    tradewater: 'Credits retired from Tradewater\'s own registry account with no beneficiary named. The end buyer is not in this data.',
    none: 'Retirements where the registry shows neither a beneficiary nor a named account.',
  };

  const cov = D.coverage;
  const identifiable = cov.beneficiary + cov.account;

  document.getElementById('source').textContent =
    D.source + ', snapshot of ' + D.generatedAt.slice(0, 10);
  document.getElementById('foot').textContent =
    'Data: CarbonPlan OffsetsDB, from public registry records (ACR, Verra, Climate Action Reserve). ' +
    'Provided as is. Registries may have their own terms on this data. A "retirement" is a credit used by a buyer, not a sale by Tradewater.';

  /* ---------- list view ---------- */
  const state = { q: '', show: 'buyers', sort: 'total' };

  function listView() {
    document.title = 'Tradewater buyer finder';
    const buyers = D.buyers;
    const people = buyers.filter(b => b.kind === 'buyer' || b.kind === 'account');

    const root = el('div');
    root.append(
      el('h1', {}, 'Who has retired Tradewater credits'),
      el('p', { class: 'lede' },
        `${D.projects.length} Tradewater projects have ${fmt(cov.total)} credits retired. ` +
        `The registries name a buyer or account holder for ${pct(identifiable, cov.total)} of that volume, ` +
        `which gives ${people.length} companies and people below.`),
      el('p', { class: 'note' },
        `${pct(cov.unnamed, cov.total)} of retired credits have no buyer recorded and ` +
        `${pct(cov.tradewaterOwn, cov.total)} were retired from Tradewater's own account. ` +
        'Treat this list as a set of leads, not a full customer list.')
    );

    const search = el('input', { type: 'search', placeholder: 'Search company or person', value: state.q, 'aria-label': 'Search' });
    const show = el('select', { 'aria-label': 'Show' },
      el('option', { value: 'buyers' }, 'Buyers and account holders'),
      el('option', { value: 'with-mid' }, 'Also marketplaces and traders'),
      el('option', { value: 'all' }, 'Everything'));
    show.value = state.show;
    const sort = el('select', { 'aria-label': 'Sort by' },
      el('option', { value: 'total' }, 'Most credits'),
      el('option', { value: 'last' }, 'Most recent retirement'),
      el('option', { value: 'years' }, 'Most years active'));
    sort.value = state.sort;

    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Search', search),
      el('label', {}, 'Show', show),
      el('label', {}, 'Sort by', sort)));

    const tableHost = el('div');
    root.append(tableHost);

    function draw() {
      const q = state.q.trim().toLowerCase();
      let rows = buyers.filter(b => {
        if (state.show === 'buyers' && !(b.kind === 'buyer' || b.kind === 'account')) return false;
        if (state.show === 'with-mid' && !(b.kind === 'buyer' || b.kind === 'account' || b.kind === 'intermediary')) return false;
        return !q || b.name.toLowerCase().includes(q);
      });
      rows = rows.slice().sort((a, z) =>
        state.sort === 'last' ? z.last.localeCompare(a.last)
          : state.sort === 'years' ? z.yearsActive - a.yearsActive || z.total - a.total
            : z.total - a.total);

      tableHost.replaceChildren();
      if (!rows.length) { tableHost.append(el('p', { class: 'empty' }, 'No matches.')); return; }
      const t = el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Buyer'),
          el('th', { class: 'num' }, 'Credits'),
          el('th', { class: 'num hide-sm' }, 'Retirements'),
          el('th', { class: 'num hide-sm' }, 'Years'),
          el('th', {}, 'Last retired'))),
        el('tbody', {}, rows.map(b => el('tr', {},
          el('td', { class: 'name' },
            el('a', { href: '#/buyer/' + encodeURIComponent(b.id) }, b.name),
            KIND_LABEL[b.kind] && b.kind !== 'buyer' ? el('span', { class: 'tag' }, KIND_LABEL[b.kind]) : null),
          el('td', { class: 'num' }, fmt(b.total)),
          el('td', { class: 'num hide-sm' }, b.count),
          el('td', { class: 'num hide-sm' }, b.yearsActive),
          el('td', { class: 'date' }, b.last || 'unknown')))));
      tableHost.append(t, el('p', { class: 'muted' }, `${rows.length} shown`));
    }
    search.addEventListener('input', () => { state.q = search.value; draw(); });
    show.addEventListener('change', () => { state.show = show.value; draw(); });
    sort.addEventListener('change', () => { state.sort = sort.value; draw(); });
    draw();

    root.append(
      el('h2', {}, 'Where the retired credits go'),
      el('table', { class: 'cov' }, el('tbody', {},
        [
          ['Named as beneficiary', cov.beneficiary],
          ['Named only as the registry account holder', cov.account],
          ['Retired from Tradewater\'s own account', cov.tradewaterOwn],
          ['No buyer recorded', cov.unnamed],
        ].map(([label, v]) => el('tr', {},
          el('td', {}, label), el('td', { class: 'num' }, fmt(v)), el('td', { class: 'num' }, pct(v, cov.total)))))));
    return root;
  }

  /* ---------- profile view ---------- */
  function yearChart(byYear) {
    const years = Object.keys(byYear).filter(y => y !== 'unknown').map(Number).sort((a, b) => a - b);
    if (!years.length) return null;
    const from = years[0], to = years[years.length - 1];
    const span = []; for (let y = from; y <= to; y++) span.push(y);
    const max = Math.max(...span.map(y => byYear[y] || 0));
    const W = 640, H = 170, pad = 22, bw = Math.min(56, (W - 20) / span.length - 8);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Credits retired per year');
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.append(n); return n;
    };
    const step = (W - 20) / span.length;
    span.forEach((y, i) => {
      const v = byYear[y] || 0;
      const h = max ? Math.max(v ? 2 : 0, (v / max) * (H - pad - 22)) : 0;
      const x = 10 + i * step + (step - bw) / 2;
      add('rect', { x, y: H - pad - h, width: bw, height: h });
      add('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }, y);
      if (v) add('text', { x: x + bw / 2, y: H - pad - h - 5, 'text-anchor': 'middle' }, fmt(v));
    });
    return svg;
  }

  function profileView(id) {
    const b = D.buyers.find(x => x.id === id);
    if (!b) return el('div', {}, el('a', { class: 'back', href: '#/' }, 'Back to all buyers'), el('p', { class: 'empty' }, 'Buyer not found.'));
    document.title = b.name + ' | Tradewater buyer finder';
    const projById = Object.fromEntries(D.projects.map(p => [p.id, p]));

    const root = el('div');
    root.append(
      el('a', { class: 'back', href: '#/' }, '← All buyers'),
      el('h1', {}, b.name),
      el('p', { class: 'lede' },
        `${fmt(b.total)} credits retired across ${b.count} retirement${b.count === 1 ? '' : 's'}` +
        (b.first ? `, from ${b.first} to ${b.last}.` : '.')));
    if (KIND_HELP[b.kind]) root.append(el('p', { class: 'note' }, KIND_HELP[b.kind]));

    root.append(el('ul', { class: 'facts' },
      el('li', {}, el('b', {}, fmt(b.total)), el('span', {}, 'credits retired')),
      el('li', {}, el('b', {}, b.yearsActive), el('span', {}, b.yearsActive === 1 ? 'year active' : 'years active')),
      el('li', {}, el('b', {}, b.last || 'unknown'), el('span', {}, 'last retirement')),
      el('li', {}, el('b', {}, b.count ? fmt(b.total / b.count) : '0'), el('span', {}, 'average per retirement'))));

    const chart = yearChart(b.byYear);
    if (chart) root.append(el('h2', {}, 'Credits retired per year'), chart);

    const types = Object.entries(b.byType).sort((a, z) => z[1] - a[1]);
    root.append(el('h2', {}, 'By project type'),
      el('table', {}, el('tbody', {}, types.map(([t, v]) =>
        el('tr', {}, el('td', {}, t), el('td', { class: 'num' }, fmt(v)), el('td', { class: 'num' }, pct(v, b.total)))))));

    root.append(el('h2', {}, 'Every retirement'),
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Date'), el('th', { class: 'num' }, 'Credits'),
          el('th', {}, 'Project'), el('th', { class: 'hide-sm' }, 'Registry note'))),
        el('tbody', {}, b.tx.map(([date, qty, pid, vintage, via, note]) => {
          const p = projById[pid];
          return el('tr', {},
            el('td', { class: 'date' }, date || 'unknown'),
            el('td', { class: 'num' }, fmt(qty)),
            el('td', {}, p && p.url ? el('a', { href: p.url, target: '_blank', rel: 'noopener' }, pid) : pid,
              vintage ? el('span', { class: 'muted' }, ` (vintage ${vintage})`) : null),
            el('td', { class: 'hide-sm muted' }, note));
        }))));
    return root;
  }

  /* ---------- partners view ---------- */
  function medianGap(tx) {
    const days = [...new Set(tx.map(t => t[0]).filter(Boolean))].sort().map(d => Date.parse(d) / 86400000);
    if (days.length < 3) return null;
    const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
  }

  function partnersView() {
    document.title = 'Partners | Tradewater buyer finder';
    const partners = D.buyers.filter(b => b.kind === 'intermediary');
    const total = partners.reduce((s, b) => s + b.total, 0);
    const yearSet = new Set();
    partners.forEach(b => Object.keys(b.byYear).forEach(y => y !== 'unknown' && yearSet.add(Number(y))));
    const years = [...yearSet].sort((a, b) => a - b);

    const root = el('div');
    root.append(
      el('h1', {}, 'Partners and marketplaces'),
      el('p', { class: 'lede' },
        `${partners.length} marketplaces, traders and programs retired ${fmt(total)} Tradewater credits, ` +
        `${pct(total, cov.total)} of all retired credits. Their customers are the real buyers, so these are the accounts to ask for customer names.`),
      el('p', { class: 'note' },
        'The partner flag comes from the name and is my guess, not confirmed. Edit scripts/intermediaries.json to change it.'));

    root.append(el('div', { class: 'scroll' }, el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, 'Partner'), el('th', { class: 'num' }, 'Credits'),
        el('th', { class: 'num hide-sm' }, 'Share'), el('th', { class: 'num hide-sm' }, 'Retirements'),
        el('th', { class: 'num hide-sm' }, 'Years'), el('th', { class: 'num hide-sm' }, 'Typical gap'),
        el('th', {}, 'Last retired'))),
      el('tbody', {}, partners.map(b => {
        const g = medianGap(b.tx);
        return el('tr', {},
          el('td', { class: 'name' }, el('a', { href: '#/buyer/' + encodeURIComponent(b.id) }, b.name)),
          el('td', { class: 'num' }, fmt(b.total)),
          el('td', { class: 'num hide-sm' }, pct(b.total, cov.total)),
          el('td', { class: 'num hide-sm' }, b.count),
          el('td', { class: 'num hide-sm' }, b.yearsActive),
          el('td', { class: 'num hide-sm' }, g == null ? 'n/a' : g + ' days'),
          el('td', { class: 'date' }, b.last || 'unknown'));
      })))),
      el('p', { class: 'muted' }, 'Typical gap is the median number of days between retirement dates, shown when a partner has at least 3.'));

    root.append(el('h2', {}, 'Credits retired by year'),
      el('div', { class: 'scroll' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Partner'), years.map(y => el('th', { class: 'num' }, y)))),
        el('tbody', {}, partners.map(b => el('tr', {},
          el('td', {}, b.name),
          years.map(y => el('td', { class: 'num' }, b.byYear[y] ? fmt(b.byYear[y]) : '–'))))))));
    return root;
  }

  /* ---------- competitor buyers view ---------- */
  const lstate = { q: '', show: 'buyers', type: 'all', sort: 'total' };

  function leadsView() {
    document.title = 'Competitor buyers | Tradewater buyer finder';
    const lc = D.leadCoverage;
    const root = el('div');
    root.append(
      el('h1', {}, 'Competitor buyers'),
      el('p', { class: 'lede' },
        `Companies that retired ${D.leadTypes.join(', ')} credits from other proponents' projects and have no retirement from a Tradewater project in this data. ` +
        `Registries name a buyer or account holder for ${pct(lc.named, lc.total)} of that volume, which gives ${D.leads.length} names.`),
      el('p', { class: 'note' },
        'A company here may already buy from Tradewater through a partner that does not name its customers. Check before reaching out. ' +
        'Several are energy traders or brokers that retire credits for others.'));

    const search = el('input', { type: 'search', placeholder: 'Search company', value: lstate.q, 'aria-label': 'Search' });
    const show = el('select', { 'aria-label': 'Show' },
      el('option', { value: 'buyers' }, 'Excluding marketplaces and traders'),
      el('option', { value: 'all' }, 'Everything'));
    show.value = lstate.show;
    const type = el('select', { 'aria-label': 'Credit type' },
      el('option', { value: 'all' }, 'All credit types'),
      D.leadTypes.map(t => el('option', { value: t }, t)));
    type.value = lstate.type;
    const sort = el('select', { 'aria-label': 'Sort by' },
      el('option', { value: 'total' }, 'Most credits'),
      el('option', { value: 'last' }, 'Most recent retirement'),
      el('option', { value: 'years' }, 'Most years active'));
    sort.value = lstate.sort;
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Search', search), el('label', {}, 'Show', show),
      el('label', {}, 'Credit type', type), el('label', {}, 'Sort by', sort)));

    const host = el('div');
    root.append(host);
    function draw() {
      const q = lstate.q.trim().toLowerCase();
      const rows = D.leads.filter(l =>
        (lstate.show === 'all' || l.kind !== 'intermediary') &&
        (lstate.type === 'all' || l.byType[lstate.type]) &&
        (!q || l.name.toLowerCase().includes(q)))
        .sort((a, z) => lstate.sort === 'last' ? z.last.localeCompare(a.last)
          : lstate.sort === 'years' ? z.yearsActive - a.yearsActive || z.total - a.total
            : z.total - a.total);
      host.replaceChildren();
      if (!rows.length) { host.append(el('p', { class: 'empty' }, 'No matches.')); return; }
      host.append(el('div', { class: 'scroll' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Company'), el('th', { class: 'num' }, 'Credits'),
          el('th', { class: 'num hide-sm' }, 'Retirements'), el('th', { class: 'hide-sm' }, 'Credit type'),
          el('th', {}, 'Last retired'))),
        el('tbody', {}, rows.map(l => el('tr', {},
          el('td', { class: 'name' },
            el('a', { href: '#/lead/' + encodeURIComponent(l.id) }, l.name),
            l.kind !== 'buyer' ? el('span', { class: 'tag' }, KIND_LABEL[l.kind]) : null),
          el('td', { class: 'num' }, fmt(l.total)),
          el('td', { class: 'num hide-sm' }, l.count),
          el('td', { class: 'hide-sm muted' }, Object.keys(l.byType).join(', ')),
          el('td', { class: 'date' }, l.last || 'unknown')))))),
        el('p', { class: 'muted' }, `${rows.length} shown`));
    }
    search.addEventListener('input', () => { lstate.q = search.value; draw(); });
    show.addEventListener('change', () => { lstate.show = show.value; draw(); });
    type.addEventListener('change', () => { lstate.type = type.value; draw(); });
    sort.addEventListener('change', () => { lstate.sort = sort.value; draw(); });
    draw();
    return root;
  }

  function leadView(id) {
    const l = D.leads.find(x => x.id === id);
    if (!l) return el('div', {}, el('a', { class: 'back', href: '#/leads' }, 'Back to competitor buyers'), el('p', { class: 'empty' }, 'Company not found.'));
    document.title = l.name + ' | Tradewater buyer finder';
    const root = el('div');
    root.append(
      el('a', { class: 'back', href: '#/leads' }, '← Competitor buyers'),
      el('h1', {}, l.name),
      el('p', { class: 'lede' },
        `${fmt(l.total)} credits retired across ${l.count} retirement${l.count === 1 ? '' : 's'} from other proponents' projects` +
        (l.first ? `, from ${l.first} to ${l.last}.` : '.')));
    if (KIND_HELP[l.kind]) root.append(el('p', { class: 'note' }, KIND_HELP[l.kind]));
    root.append(el('ul', { class: 'facts' },
      el('li', {}, el('b', {}, fmt(l.total)), el('span', {}, 'credits retired')),
      el('li', {}, el('b', {}, l.yearsActive), el('span', {}, l.yearsActive === 1 ? 'year active' : 'years active')),
      el('li', {}, el('b', {}, l.last || 'unknown'), el('span', {}, 'last retirement')),
      el('li', {}, el('b', {}, fmt(l.total / l.count)), el('span', {}, 'average per retirement'))));
    const chart = yearChart(l.byYear);
    if (chart) root.append(el('h2', {}, 'Credits retired per year'), chart);
    root.append(el('h2', {}, 'Who they buy from now'),
      el('table', {}, el('tbody', {}, l.proponents.map(([n, v]) =>
        el('tr', {}, el('td', {}, n), el('td', { class: 'num' }, fmt(v)), el('td', { class: 'num' }, pct(v, l.total)))))));
    root.append(el('h2', {}, l.count > l.tx.length ? `Latest ${l.tx.length} of ${l.count} retirements` : 'Every retirement'),
      el('div', { class: 'scroll' }, el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Date'), el('th', { class: 'num' }, 'Credits'),
          el('th', {}, 'Project'), el('th', { class: 'hide-sm' }, 'Registry note'))),
        el('tbody', {}, l.tx.map(([date, qty, pid, vintage, note, prop]) => el('tr', {},
          el('td', { class: 'date' }, date || 'unknown'),
          el('td', { class: 'num' }, fmt(qty)),
          el('td', {}, pid, el('span', { class: 'muted' }, ` ${prop}` + (vintage ? ` (vintage ${vintage})` : ''))),
          el('td', { class: 'hide-sm muted' }, note)))))));
    return root;
  }

  /* ---------- router ---------- */
  function route() {
    const h = location.hash;
    let m, node, section = 'buyers';
    if ((m = h.match(/^#\/buyer\/(.+)$/))) node = profileView(decodeURIComponent(m[1]));
    else if (h === '#/partners') { node = partnersView(); section = 'partners'; }
    else if ((m = h.match(/^#\/lead\/(.+)$/))) { node = leadView(decodeURIComponent(m[1])); section = 'leads'; }
    else if (h === '#/leads') { node = leadsView(); section = 'leads'; }
    else node = listView();
    document.querySelectorAll('nav a').forEach(a =>
      a.getAttribute('data-s') === section ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    view.replaceChildren(node);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
