// Targets, Accounts and the company detail page.
(function () {
  const K = window.TWKit, S = window.TWStore, C = S.consts;
  const { el, fmt, btn, field, input, textarea, select, today, addDays, daysSince } = K;
  const go = hash => { location.hash = hash; };
  const homeFor = c => (c.type === 'prospect' ? '#/targets' : '#/accounts');
  const typeLabel = t => (C.COMPANY_TYPES.find(x => x[0] === t) || [t, t])[1];
  const statusesFor = type => (type === 'prospect' ? C.PROSPECT_STATUS : C.ACCOUNT_STATUS);

  function dueTag(date) {
    if (!date) return null;
    const d = K.daysBetween(today(), date);
    if (d < 0) return el('span', { class: 'tag warn' }, `${-d} days overdue`);
    if (d === 0) return el('span', { class: 'tag warn' }, 'today');
    return null;
  }

  /* ---------- suggestions from the market data ---------- */
  function suggestionRows(kind) {
    const D = window.TW_DATA;
    if (!D) return [];
    const have = new Set(S.state().companies.map(c => S.nameKey(c.name)));
    let items;
    if (kind === 'targets') {
      // Best fit first, from the lead ranking.
      items = window.TWScore.rank('new').map(r => ({ e: r.e, type: 'prospect', refType: 'lead', r }));
    } else {
      const customers = window.TWScore.rank('repeat').map(r => ({ e: r.e, type: 'customer', refType: 'buyer', r }));
      const partners = D.buyers.filter(b => b.kind === 'intermediary').map(e => ({ e, type: 'partner', refType: 'buyer' }));
      items = customers.filter(i => !have.has(S.nameKey(i.e.name))).slice(0, 6).concat(partners.filter(i => !have.has(S.nameKey(i.e.name))).slice(0, 2));
    }
    return items.filter(i => !have.has(S.nameKey(i.e.name))).slice(0, 8);
  }

  function suggestions(kind) {
    const rows = suggestionRows(kind);
    if (!rows.length) return null;
    const intro = kind === 'targets'
      ? 'Companies that retired the same credit types from other proponents, best fit first. Check each one before reaching out.'
      : 'Names that retired Tradewater credits, best repeat-purchase fit first, then partners. A company may have bought through a partner, and marketplaces are listed as partners (my guess from the name).';
    return el('div', {},
      el('h2', {}, 'Suggested from the data'),
      el('p', { class: 'muted' }, intro, ' ', el('a', { href: '#/ranking' }, 'See the full ranking and how it is scored')),
      el('div', { class: 'scroll' }, el('table', {}, el('tbody', {}, rows.map(({ e, type, refType, r }) =>
        el('tr', {},
          el('td', { class: 'name' }, e.name, e.kind !== 'buyer' && e.kind !== 'account' ? el('span', { class: 'tag' }, 'likely marketplace or trader') : null,
            r ? el('span', { class: 'tag' }, 'fit ' + r.score) : null,
            r ? el('div', { class: 'muted small' }, (window.TWScore.topReasons(r, 2).join('; ') || 'weak match') + '.') : null),
          el('td', { class: 'num' }, fmt(e.total) + ' credits'),
          el('td', { class: 'date hide-sm' }, e.last ? 'last ' + e.last : ''),
          el('td', {}, btn('Add as ' + typeLabel(type).toLowerCase(), () => {
            S.addCompany({ name: e.name, type, status: type === 'prospect' ? 'New' : 'Active', ref: { type: refType, id: e.id } });
            S.redraw();
          }, 'small'))))))));
  }

  /* ---------- Targets and Accounts list ---------- */
  function listPage(kind) {
    const isT = kind === 'targets';
    document.title = (isT ? 'Targets' : 'Accounts') + ' | Tradewater sales tool';
    const types = isT ? ['prospect'] : ['customer', 'partner'];
    const f = { q: '', status: 'all' };
    const root = el('div');
    root.append(
      el('h1', {}, isT ? 'Targets' : 'Accounts'),
      el('p', { class: 'lede' }, isT
        ? 'Companies you want to reach. Track who you contacted, how, and when to reach out next.'
        : 'Customers and partners. Track the relationship, when they usually buy, and when to ask about the next purchase.'));

    const nameIn = el('input', { type: 'text', placeholder: 'Company name', 'aria-label': 'Company name' });
    const typeSel = isT ? null : select(C.COMPANY_TYPES.filter(t => t[0] !== 'prospect'), 'customer', () => {}, { 'aria-label': 'Type' });
    const add = () => {
      const name = nameIn.value.trim();
      if (!name) { nameIn.focus(); return; }
      const type = isT ? 'prospect' : typeSel.value;
      const c = S.addCompany({ name, type, status: type === 'prospect' ? 'New' : 'Active' });
      go('#/company/' + c.id);
    };
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    root.append(el('div', { class: 'controls' },
      el('label', {}, isT ? 'Add a target' : 'Add an account', nameIn),
      typeSel ? el('label', {}, 'Type', typeSel) : null,
      el('label', {}, ' ', btn('Add', add, 'primary'))));

    const all = S.state().companies.filter(c => types.includes(c.type));
    const host = el('div');
    if (!all.length) {
      host.append(el('p', { class: 'empty' }, isT
        ? 'No targets yet. Type a company name above, or add one from the suggestions below.'
        : 'No accounts yet. Type a name above, or add one from the suggestions below.'));
    } else {
      const search = el('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search' });
      const statusSel = select([['all', 'All statuses'], ...(isT ? C.PROSPECT_STATUS : C.ACCOUNT_STATUS).map(s => [s, s])], 'all', () => {});
      const table = el('div');
      const draw = () => {
        const q = f.q.trim().toLowerCase();
        const rows = all.filter(c => (f.status === 'all' || c.status === f.status) && (!q || c.name.toLowerCase().includes(q)))
          .sort((a, z) => (a.nextTouch || '9999').localeCompare(z.nextTouch || '9999') || a.name.localeCompare(z.name));
        table.replaceChildren();
        if (!rows.length) { table.append(el('p', { class: 'empty' }, 'No matches.')); return; }
        table.append(el('div', { class: 'scroll' }, el('table', {},
          el('thead', {}, el('tr', {},
            el('th', {}, 'Company'), el('th', {}, 'Status'), el('th', { class: 'hide-sm' }, 'Channel'),
            el('th', {}, 'Next touch'), el('th', { class: 'hide-sm' }, 'Last touch'), el('th', { class: 'num hide-sm' }, 'People'))),
          el('tbody', {}, rows.map(c => el('tr', {},
            el('td', { class: 'name' }, el('a', { href: '#/company/' + c.id }, c.name),
              isT ? null : el('span', { class: 'tag' }, typeLabel(c.type))),
            el('td', {}, c.status),
            el('td', { class: 'hide-sm muted' }, c.channel || ''),
            el('td', { class: 'date' }, c.nextTouch || '', ' ', dueTag(c.nextTouch)),
            el('td', { class: 'hide-sm muted' }, c.lastTouch ? `${c.lastTouch} (${daysSince(c.lastTouch)}d ago)` : 'never'),
            el('td', { class: 'num hide-sm' }, c.people.length)))))));
      };
      search.addEventListener('input', () => { f.q = search.value; draw(); });
      statusSel.addEventListener('change', () => { f.status = statusSel.value; draw(); });
      root.append(el('div', { class: 'controls' }, el('label', {}, 'Search', search), el('label', {}, 'Status', statusSel)));
      draw();
      host.append(table);
    }
    root.append(host);
    const sug = suggestions(kind);
    if (sug) root.append(sug);
    return root;
  }

  /* ---------- company detail ---------- */
  function notFound(back, text) {
    return el('div', {}, el('a', { class: 'back', href: back }, '← Back'), el('p', { class: 'empty' }, text));
  }

  function dataPanel(c) {
    const D = window.TW_DATA;
    const entry = S.dataEntry(c.ref);
    const wrap = el('div');
    wrap.append(el('h2', {}, 'Market data'));
    if (entry) {
      const um = S.usualMonths(entry);
      wrap.append(
        el('ul', { class: 'facts' },
          el('li', {}, el('b', {}, fmt(entry.total)), el('span', {}, 'credits retired')),
          el('li', {}, el('b', {}, entry.count), el('span', {}, 'retirements')),
          el('li', {}, el('b', {}, entry.yearsActive), el('span', {}, 'years active')),
          el('li', {}, el('b', {}, entry.last || 'unknown'), el('span', {}, 'last retirement'))),
        el('p', {}, um
          ? `Usually retires in ${S.monthName(um.month)} (${um.years} of ${um.ofYears} years with retirements).`
          : 'Not enough years of retirements to find a usual month.'),
        el('p', {}, el('a', { href: (c.ref.type === 'lead' ? '#/lead/' : '#/buyer/') + encodeURIComponent(c.ref.id) }, 'Open the full retirement history'),
          ' ', btn('Unlink', () => { c.ref = null; S.save(); S.redraw(); }, 'small')));
    } else if (D) {
      const names = [...D.buyers.map(b => ['buyer', b]), ...D.leads.map(l => ['lead', l])];
      const dl = el('datalist', { id: 'data-names' }, names.map(([, e]) => el('option', { value: e.name })));
      const linkIn = el('input', { type: 'text', list: 'data-names', placeholder: 'Type a name from the registry data', 'aria-label': 'Link to market data' });
      linkIn.addEventListener('change', () => {
        const hit = names.find(([, e]) => e.name === linkIn.value);
        if (hit) { c.ref = { type: hit[0], id: hit[1].id }; S.save(); S.redraw(); }
      });
      wrap.append(el('p', { class: 'muted' }, 'Link this company to its registry record to see its retirement history and usual buying month.'), linkIn, dl);
    }
    return wrap;
  }

  function companyPage(id) {
    const c = S.findCompany(id);
    if (!c) return notFound('#/targets', 'Company not found. It may have been deleted.');
    document.title = c.name + ' | Tradewater sales tool';
    const set = (k, v) => { c[k] = v; S.save(); };
    const root = el('div');
    root.append(el('a', { class: 'back', href: homeFor(c) }, '← ' + (c.type === 'prospect' ? 'Targets' : 'Accounts')), el('h1', {}, c.name));

    const typeSel = select(C.COMPANY_TYPES, c.type, v => {
      c.type = v; if (!statusesFor(v).includes(c.status)) c.status = statusesFor(v)[0]; S.save(); S.redraw();
    });
    root.append(el('div', { class: 'form-grid' },
      field('Name', input(c.name, v => { if (v.trim()) { set('name', v.trim()); document.querySelector('h1').textContent = v.trim(); } })),
      field('Type', typeSel),
      field('Status', select(statusesFor(c.type), c.status, v => set('status', v))),
      field('Planned channel', select([['', 'Not chosen'], ...C.CHANNELS.map(x => [x, x])], c.channel, v => set('channel', v))),
      field('Next touch', input(c.nextTouch, v => { set('nextTouch', v); S.redraw(); }, { type: 'date' })),
      field('Remind me', S.remindField(c, 'nextTouchRemind')),
      field('Last touch', el('div', { class: 'static' }, c.lastTouch ? `${c.lastTouch} (${daysSince(c.lastTouch)} days ago)` : 'never'))));
    const st = S.state().settings;
    root.append(el('p', {},
      btn(`Next touch in ${st.nurtureDays} days`, () => { set('nextTouch', addDays(today(), st.nurtureDays)); S.redraw(); }, 'small'), ' ',
      c.nextTouch ? btn('Clear next touch', () => { set('nextTouch', ''); S.redraw(); }, 'small') : null));
    root.append(field('Notes', textarea(c.notes, v => set('notes', v), { rows: 4 })));

    root.append(dataPanel(c));

    // People
    root.append(el('h2', {}, 'People'));
    if (!c.people.length) root.append(el('p', { class: 'muted' }, 'No contacts yet. Add the people you want to reach and how you know them.'));
    c.people.forEach((p, i) => root.append(el('div', { class: 'person' },
      el('div', { class: 'form-grid' },
        field('Name', input(p.name, v => { p.name = v; S.save(); })),
        field('Title', input(p.title, v => { p.title = v; S.save(); })),
        field('LinkedIn link', input(p.linkedin, v => { p.linkedin = v; S.save(); }, { placeholder: 'https://' })),
        field('Notes, mutual connections', input(p.note, v => { p.note = v; S.save(); }))),
      el('p', {}, /^https?:\/\//.test(p.linkedin || '') ? el('a', { href: p.linkedin, target: '_blank', rel: 'noopener' }, 'Open LinkedIn') : null, ' ',
        btn('Remove', () => { c.people.splice(i, 1); S.save(); S.redraw(); }, 'small')))));
    root.append(btn('Add a person', () => { c.people.push({ name: '', title: '', linkedin: '', note: '' }); S.save(); S.redraw(); }));

    // Touches
    root.append(el('h2', {}, 'Touches'));
    const tDate = el('input', { type: 'date', value: today(), 'aria-label': 'Date' });
    const tChan = select(C.CHANNELS, 'Cold email', () => {}, { 'aria-label': 'Channel' });
    const tNote = el('input', { type: 'text', placeholder: 'What happened, what is next', 'aria-label': 'Note' });
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Date', tDate), el('label', {}, 'Channel', tChan), el('label', {}, 'Note', tNote),
      el('label', {}, ' ', btn('Log touch', () => {
        if (!tDate.value) return;
        S.logTouch(c, { date: tDate.value, channel: tChan.value, note: tNote.value.trim() });
        S.redraw();
      }, 'primary'))));
    const touches = c.touches.slice().sort((a, z) => z.date.localeCompare(a.date));
    if (touches.length) {
      root.append(el('div', { class: 'scroll' }, el('table', {}, el('tbody', {}, touches.map(t => el('tr', {},
        el('td', { class: 'date' }, t.date), el('td', {}, t.channel), el('td', { class: 'muted' }, t.note),
        el('td', {}, btn('Delete', () => {
          c.touches.splice(c.touches.indexOf(t), 1);
          c.lastTouch = c.touches.map(x => x.date).sort().pop() || '';
          S.save(); S.redraw();
        }, 'small'))))))));
    } else root.append(el('p', { class: 'muted' }, 'No touches logged yet.'));

    // Deals
    const deals = S.state().deals.filter(d => d.companyId === c.id);
    root.append(el('h2', {}, 'Deals'));
    if (deals.length) root.append(el('ul', { class: 'plain' }, deals.map(d => el('li', {}, el('a', { href: '#/deal/' + d.id }, d.name || 'Untitled deal'), ` (${d.stage})`))));
    root.append(btn('New deal with this company', () => {
      const d = S.addDeal({ name: c.name, companyId: c.id, companyName: c.name });
      go('#/deal/' + d.id);
    }));

    root.append(el('h2', {}, 'Delete'), el('p', {}, btn('Delete this company', () => {
      if (window.confirm(`Delete ${c.name}? Its touches and contacts are removed. Deals stay but lose the link.`)) { S.removeCompany(c.id); go(homeFor(c)); }
    }, 'danger')));
    return root;
  }

  window.TWPages.targets = () => listPage('targets');
  window.TWPages.targets.section = 'targets';
  window.TWPages.accounts = () => listPage('accounts');
  window.TWPages.accounts.section = 'accounts';
  window.TWPages.company = companyPage;
  window.TWPages.company.section = id => { const c = S.findCompany(id); return c && c.type === 'prospect' ? 'targets' : 'accounts'; };

  // Used by the market data profile pages.
  window.TWHooks = window.TWHooks || {};
  window.TWHooks.companyButtons = function (name, ref, types) {
    const existing = S.findCompanyByName(name);
    if (existing) return el('p', {}, el('a', { href: '#/company/' + existing.id }, `In your ${existing.type === 'prospect' ? 'targets' : 'accounts'}: open ${existing.name}`));
    return el('p', {}, types.map(([type, label]) => btn(label, () => {
      const c = S.addCompany({ name, type, status: type === 'prospect' ? 'New' : 'Active', ref });
      go('#/company/' + c.id);
    }, 'small')).flatMap(b => [b, ' ']));
  };
})();
