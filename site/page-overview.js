// Overview (the front page) and Insights: written from the registry data, with numbers computed on load.
(function () {
  const K = window.TWKit, S = window.TWStore;
  const { el, fmt, pct, short } = K;
  const C = () => window.TWCharts;

  const REGISTRY = { ACR: 'the American Carbon Registry', CAR: 'the Climate Action Reserve', VCS: 'Verra' };
  const million = n => (n / 1e6).toFixed(1) + ' million';
  const list = items => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const missing = title => el('div', {}, el('h1', {}, title), el('p', { class: 'empty' }, 'Registry data is missing. Run scripts/build-portfolio.mjs.'));
  const topYears = (byYear, n) => Object.entries(byYear).filter(([y]) => /^\d{4}$/.test(y)).sort((a, z) => z[1] - a[1]).slice(0, n).map(([y]) => y);

  const SOURCE = P => `Source: Berkeley Carbon Trading Project, Voluntary Registry Offsets Database ${P.version}, through ${P.throughDate}.`;
  const COMPLIANCE = 'Berkeley records California compliance retirements in 2014, 2017 and 2020 and in 2022 to 2024, so single years can swing.';

  /* ---------- Overview ---------- */
  function workStrip() {
    const st = S.state();
    const has = st.companies.length + st.deals.length + st.events.length + st.calls.length > 0;
    if (!has) return el('p', {}, 'Your workspace is empty. ', el('a', { href: '#/week' }, 'Open This week'), ' to add your first deal, target, call or event.');
    const reminders = window.TWAgenda ? window.TWAgenda.reminders().length : 0;
    const open = st.deals.filter(S.isOpenDeal).length;
    const targets = st.companies.filter(c => c.type === 'prospect' && c.status !== 'Not a fit').length;
    return el('p', {}, `In your workspace: ${reminders} reminder${reminders === 1 ? '' : 's'} due, ${open} open deal${open === 1 ? '' : 's'}, ${targets} active target${targets === 1 ? '' : 's'}. `,
      el('a', { href: '#/week' }, 'Open This week'));
  }

  function marketSummary(P) {
    const M = P.market;
    if (!M) return null;
    const share = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '0%');
    const rows = M.types.map(t => {
      const lead = t.developers[0];
      const largest = lead.isTradewater ? `Tradewater (next: ${t.developers[1].name})` : `${lead.name} (${short(lead.issued)})`;
      return el('tr', {},
        el('td', { class: 'name' }, t.name),
        el('td', { class: 'num' }, `${t.tradewater.projects} of ${t.all.projects}`),
        el('td', { class: 'num' }, share(t.tradewater.issued, t.all.issued)),
        el('td', { class: 'num hide-sm' }, `${ordinal(t.twRank)} of ${t.developerCount}`),
        el('td', { class: 'hide-sm' }, largest));
    });
    return el('div', { class: 'scroll' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Project type'), el('th', { class: 'num' }, 'Tradewater projects'), el('th', { class: 'num' }, 'Share of credits issued'),
        el('th', { class: 'num hide-sm' }, 'Rank by credits issued'), el('th', { class: 'hide-sm' }, 'Largest developer'))),
      el('tbody', {}, rows)));
  }

  function overviewPage() {
    document.title = 'Tradewater sales tool';
    const P = window.TW_PORTFOLIO;
    if (!P) return missing('Overview');
    const t = P.totals, R = P.reconcile, M = P.market;
    const root = el('div', { class: 'article' });

    const regs = P.byRegistry.map(g => REGISTRY[g.name]).filter(Boolean);
    root.append(
      el('h1', {}, `Tradewater has issued ${million(t.issued)} carbon credits across ${t.projects} projects, and ${pct(t.retired, t.issued)} are retired.`),
      el('p', { class: 'lede' }, `The projects are registered with ${list(regs)}. This briefing is written from public registry data through ${P.throughDate}, mainly the Berkeley Carbon Trading Project database.`),
      el('ul', { class: 'facts' },
        el('li', {}, el('b', {}, fmt(t.issued)), el('span', {}, 'credits issued')),
        el('li', {}, el('b', {}, fmt(t.retired)), el('span', {}, 'credits retired')),
        el('li', {}, el('b', {}, fmt(t.remaining)), el('span', {}, 'credits remaining'))));

    const noteBits = ['Remaining means issued minus retired. It does not mean unsold.'];
    if (R && R.cancelled) noteBits.push(`${fmt(R.cancelled)} of the remaining credits, on ${R.cancelledProjects} projects, are shown as cancelled in CarbonPlan's records, so the figure may overstate what is available.`);
    root.append(el('p', { class: 'note' }, noteBits.join(' ')));

    // What has been retired
    root.append(el('h2', {}, 'What has been retired, and what is left'));
    const lastFull = String(new Date().getFullYear() - 1);
    const busiest = topYears(P.retiredByYear, 3);
    root.append(el('p', {},
      P.retiredByYear[lastFull] ? `In ${lastFull}, ${fmt(P.retiredByYear[lastFull])} credits from Tradewater projects were retired. ` : '',
      busiest.length ? `The busiest years so far were ${list(busiest)}. ` : '', COMPLIANCE));
    const f1 = C().barChart(P.retiredByYear, { aria: 'Credits retired per year' });
    if (f1) root.append(C().figure(1, 'Credits retired per year, all Tradewater projects.', f1, SOURCE(P)));

    const topV = topYears(P.remainingByVintage, 2);
    const topShare = topV.reduce((s, y) => s + P.remainingByVintage[y], 0);
    root.append(el('p', {}, topV.length === 2
      ? `Of the ${fmt(t.remaining)} credits remaining, ${pct(topShare, t.remaining)} come from the ${topV.sort().join(' and ')} vintages. Vintage is the year the emissions reduction happened.`
      : ''));
    const f2 = C().barChart(P.remainingByVintage, { highlight: y => topV.includes(String(y)), aria: 'Credits remaining by vintage' });
    if (f2) root.append(C().figure(2, 'Credits remaining by vintage. The two largest are highlighted.', f2, SOURCE(P)));

    // Market
    if (M) {
      const s = (M.tradewater.issued / M.all.issued * 100).toFixed(1);
      root.append(el('h2', {}, 'How Tradewater compares'),
        el('p', {}, `In the ${M.types.length} project types Tradewater works in, Berkeley lists ${fmt(M.all.projects)} projects. Tradewater developed ${M.tradewater.projects} of them and accounts for ${s}% of the ${million(M.all.issued)} credits issued. ` +
          'The share varies a lot by type.'),
        marketSummary(P),
        el('p', { class: 'source' }, SOURCE(P)),
        el('p', {}, el('a', { href: '#/insights' }, 'See the full comparison in Insights')));
    }

    root.append(el('h2', {}, 'Go further'),
      el('ul', { class: 'plain' },
        el('li', {}, el('a', { href: '#/buyers' }, 'Market data'), ': who has retired Tradewater credits, which partners resell them, and companies buying the same credit types elsewhere.'),
        el('li', {}, el('a', { href: '#/insights' }, 'Insights'), ': the full developer comparison for each project type.'),
        el('li', {}, el('a', { href: '#/ranking' }, 'Lead ranking'), ': companies worth a conversation, with the reasons for each score.'),
        el('li', {}, el('a', { href: '#/content/newsletter' }, 'Content'), ': post and newsletter drafts built from these numbers.')),
      workStrip());
    return root;
  }

  /* ---------- Insights ---------- */
  function insightsPage() {
    document.title = 'Insights | Tradewater sales tool';
    const P = window.TW_PORTFOLIO;
    if (!P || !P.market) return missing('Insights');
    const M = P.market;
    const root = el('div', { class: 'article' });
    root.append(
      el('h1', {}, 'Who else sells these credits'),
      el('p', { class: 'lede' }, `Berkeley's database groups projects by type. Tradewater's projects fall into ${M.types.length} of those types. Here is how each type is divided among developers, by credits issued.`));

    M.types.forEach(t => {
      const share = (t.tradewater.issued / t.all.issued * 100);
      const retiredShare = t.all.retired ? (t.tradewater.retired / t.all.retired * 100) : 0;
      root.append(el('h2', {}, t.name),
        el('p', {}, `Tradewater ranks ${ordinal(t.twRank)} of ${t.developerCount} developers by credits issued, with ${fmt(t.tradewater.issued)} of ${fmt(t.all.issued)} (${share.toFixed(1)}%). ` +
          `It holds ${retiredShare.toFixed(1)}% of the credits retired in this type.`),
        C().hbars(t.developers.map(d => ({
          name: d.name, value: d.issued, valueText: short(d.issued) + ' issued', highlight: d.isTradewater,
          sub: `${d.projects} project${d.projects === 1 ? '' : 's'}, ${pct(d.retired, d.issued)} retired`,
        }))),
        el('p', { class: 'source' }, t.developerCount > t.developers.length ? `Largest ${t.developers.length} developers shown, plus Tradewater. ${SOURCE(P)}` : SOURCE(P)));
    });

    root.append(el('h2', {}, 'Over time'));
    const a = C().stackedBars(M.issuedByVintage.others, M.issuedByVintage.tradewater, { aria: 'Credits issued by vintage, Tradewater and other developers' });
    if (a) root.append(C().figure(3, 'Credits issued by vintage year, across the three types.', a, SOURCE(P),
      C().legend([['sw other', 'Other developers'], ['sw hl', 'Tradewater']])));
    const b = C().stackedBars(M.retiredByYear.others, M.retiredByYear.tradewater, { aria: 'Credits retired per year, Tradewater and other developers' });
    if (b) root.append(C().figure(4, 'Credits retired per year, across the three types.', b, `${SOURCE(P)} ${COMPLIANCE}`,
      C().legend([['sw other', 'Other developers'], ['sw hl', 'Tradewater']])));

    root.append(el('h2', {}, 'Reading these numbers'),
      el('ul', { class: 'plain' },
        el('li', {}, 'Types are Berkeley\'s labels. Other refrigerant project types, such as HFC replacement in foam production or leak detection, are not counted here and would change the shares.'),
        el('li', {}, 'Developer names are as the registries list them. Related companies can appear as separate developers, and Tradewater\'s several legal names are combined.'),
        el('li', {}, 'Credits issued are not credits sold, and a developer\'s share of issuance says little about its share of sales.'),
        el('li', {}, 'Retirements in compliance programs are recorded in lump years, which makes single years noisy.')),
      el('p', { class: 'source' }, 'Cite as: ' + (P.citation || ('Voluntary Registry Offsets Database ' + P.version + ', Berkeley Carbon Trading Project, University of California, Berkeley.')) + ' Licensed CC BY 4.0.'));
    return root;
  }

  window.TWPages.overview = overviewPage;
  window.TWPages.overview.section = 'overview';
  window.TWPages.insights = insightsPage;
  window.TWPages.insights.section = 'insights';
})();
