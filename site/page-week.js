// "This week": the page Eli opens first. Everything on it is derived from what is entered plus the registry data,
// and almost every row has buttons so the work can be done right here.
(function () {
  const K = window.TWKit, S = window.TWStore, C = S.consts;
  const { el, fmt, btn, select, today, addDays, daysSince, daysBetween } = K;
  const A = () => window.TWActions;

  // State that survives a redraw of this page.
  const ui = { type: 'deal', flash: null, leadOffset: 0 };

  const section = (title, hint, ...kids) => el('div', {}, el('h2', {}, title), hint ? el('p', { class: 'muted' }, hint) : null, ...kids);
  const table = (head, rows) => el('div', { class: 'scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, head.map(h => el('th', { class: h.cls || '' }, h.t || h)))),
    el('tbody', {}, rows)));
  // A row with a heading line and a line of controls underneath.
  const rowcard = (head, controls) => el('div', { class: 'rowcard' }, el('div', { class: 'rowcard-head' }, head), el('div', { class: 'row-actions' }, controls));
  const flash = (text, href) => { ui.flash = { text, href }; K.refresh(); };

  /* ---------- quick add ---------- */
  const QA = {
    deal: { label: 'Deal', ph: 'Deal or company name' },
    target: { label: 'Target', ph: 'Company name' },
    call: { label: 'Call or meeting', ph: 'Who and what, for example: Call with Example Co' },
    event: { label: 'Event', ph: 'Event name' },
  };

  function quickAdd(empty) {
    const typeSel = select(Object.entries(QA).map(([k, v]) => [k, v.label]), ui.type, () => {}, { 'aria-label': 'What to add' });
    const nameIn = el('input', { type: 'text', 'aria-label': 'Name' });
    const dateIn = el('input', { type: 'date', value: today(), 'aria-label': 'Date' });
    const timeIn = el('input', { type: 'time', 'aria-label': 'Time' });
    const dateLab = el('label', {}, 'Date', dateIn), timeLab = el('label', {}, 'Time', timeIn);
    const sync = () => {
      nameIn.placeholder = QA[ui.type].ph;
      dateLab.hidden = !(ui.type === 'call' || ui.type === 'event');
      timeLab.hidden = ui.type !== 'call';
      if (ui.type === 'event' && dateIn.value === today()) dateIn.value = '';
      if (ui.type === 'call' && !dateIn.value) dateIn.value = today();
    };
    typeSel.addEventListener('change', () => { ui.type = typeSel.value; sync(); nameIn.focus(); });

    const add = () => {
      const name = nameIn.value.trim();
      if (!name) { nameIn.focus(); return; }
      if (ui.type === 'deal') {
        const c = S.findCompanyByName(name);
        const d = S.addDeal({ name, companyId: c ? c.id : '' });
        flash(`Deal added: ${name}. Set its next step below.`, '#/deal/' + d.id);
      } else if (ui.type === 'target') {
        const had = S.findCompanyByName(name);
        const c = S.addCompany({ name, type: 'prospect', status: 'New' });
        flash(had ? `${c.name} is already in your list.` : `Target added: ${name}.`, '#/company/' + c.id);
      } else if (ui.type === 'call') {
        if (!dateIn.value) { dateIn.focus(); return; }
        const co = S.findCompanyByName(name.replace(/^(call|meeting)( with)?\s+/i, ''));
        const call = S.addCall({ title: name, date: dateIn.value, time: timeIn.value, companyId: co ? co.id : '' });
        flash(`Added to your calendar for ${window.TWAgenda.dayLabel(call.date)}.`, '#/call/' + call.id);
      } else {
        const e = S.addEvent({ name, date: dateIn.value });
        flash(`Event added: ${name}.`, '#/event/' + e.id);
      }
    };
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    sync();
    const bar = el('div', { class: 'quick-add' },
      el('div', { class: 'controls' },
        el('label', {}, 'Add', typeSel), el('label', { class: 'grow' }, 'Name', nameIn), dateLab, timeLab,
        el('label', {}, ' ', btn('Add', add, 'primary'))),
      el('p', { class: 'muted' }, empty
        ? 'Start here: type a name and press Enter. Everything you add shows up below with buttons to act on it. Or import a spreadsheet in Settings.'
        : 'Type a name and press Enter.'));
    if (ui.flash) {
      bar.append(el('p', { class: 'flash', role: 'status' }, ui.flash.text, ' ', el('a', { href: ui.flash.href }, 'Open it')));
      ui.flash = null;
      setTimeout(() => nameIn.focus(), 0);
    }
    return bar;
  }

  /* ---------- reminders ---------- */
  function remindersSection() {
    const all = window.TWAgenda.items();
    const due = window.TWAgenda.reminders();
    const dueSet = new Set(due);
    const soon = all.filter(i => i.days >= 0 && i.days <= 7 && !dueSet.has(i));
    return section('Reminders', 'Calls, events, deal steps and touches inside their reminder window, plus anything overdue.',
      due.length ? window.TWAgenda.itemTable(due, true, true) : el('p', {}, 'Nothing is due inside its reminder window.'),
      soon.length ? el('h3', {}, 'Later this week') : null,
      soon.length ? window.TWAgenda.itemTable(soon, true) : null,
      el('p', {}, el('a', { href: '#/calendar' }, 'Open the calendar')));
  }

  /* ---------- deals ---------- */
  function dealsAttention(st) {
    const open = st.deals.filter(S.isOpenDeal);
    const rows = open.map(d => ({ d, f: window.TWDeals.flags(d) })).filter(x => x.f.length)
      .sort((a, z) => z.f.length - a.f.length || (a.d.nextStepDate || '9999').localeCompare(z.d.nextStepDate || '9999'));
    if (!open.length) return section('Open deals needing a next step', null, el('p', { class: 'muted' }, 'No open deals. Add one with the bar at the top.'));
    if (!rows.length) return section('Open deals needing a next step', null, el('p', {}, `All ${open.length} open deals have a next step and recent contact.`));
    return section('Open deals needing a next step', `${rows.length} of ${open.length} open deals need attention. Set a next step right here.`,
      rows.map(({ d, f }) => {
        const stepIn = el('input', { type: 'text', placeholder: 'Next step', 'aria-label': 'Next step for ' + d.name });
        stepIn.value = d.nextStep || '';
        const dateIn = el('input', { type: 'date', 'aria-label': 'Due date for ' + d.name, value: d.nextStepDate || '' });
        const save = () => { if (!stepIn.value.trim()) { stepIn.focus(); return; } A().setNextStep(d, stepIn.value, dateIn.value); };
        stepIn.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
        return rowcard(
          [el('a', { href: '#/deal/' + d.id }, d.name || 'Untitled deal'), el('span', { class: 'muted' }, ` ${window.TWDeals.companyName(d)} · ${d.stage} `), f.map(x => el('span', { class: 'tag warn' }, x))],
          [stepIn, dateIn, btn('Save next step', save, 'small'), d.nextStep ? btn('Step done', () => A().stepDone(d), 'small') : null,
            btn('Touched base today', () => A().touchedBase(d), 'small')]);
      }));
  }

  /* ---------- touches due ---------- */
  function touchesDue(st) {
    const T = today(), nd = st.settings.nurtureDays, rows = [];
    st.companies.forEach(c => {
      if (c.status === 'Not a fit') return;
      if (c.nextTouch && c.nextTouch <= T) rows.push({ c, why: c.nextTouch === T ? 'Next touch is today' : `Next touch was due ${c.nextTouch}`, sort: c.nextTouch });
      else if (!c.nextTouch && c.lastTouch && daysSince(c.lastTouch) >= nd && (c.type !== 'prospect' || ['Contacted', 'Nurturing', 'Meeting booked'].includes(c.status)))
        rows.push({ c, why: `No touch for ${daysSince(c.lastTouch)} days`, sort: c.lastTouch });
    });
    rows.sort((a, z) => a.sort.localeCompare(z.sort));
    const hint = `Companies with a next touch due, or not touched for ${nd} days. Logging a touch sets the next one ${nd} days out.`;
    if (!rows.length) return section('Reach out or nurture', hint, el('p', {}, 'Nothing is due.'));
    return section('Reach out or nurture', hint, rows.map(({ c, why }) => {
      const chan = select(C.CHANNELS, c.channel || 'Cold email', () => {}, { 'aria-label': 'Channel for ' + c.name });
      const note = el('input', { type: 'text', placeholder: 'Note (optional)', 'aria-label': 'Note for ' + c.name });
      return rowcard(
        [el('a', { href: '#/company/' + c.id }, c.name), el('span', { class: 'tag' }, c.type === 'prospect' ? 'target' : c.type), el('span', { class: 'muted' }, ' ' + why)],
        [chan, note, btn('Log touch', () => A().logTouch(c, { channel: chan.value, note: note.value.trim() }), 'small'),
          btn('Snooze a week', () => A().snooze(c, 'nextTouch', 7), 'small'),
          c.type === 'prospect' ? btn('Not a fit', () => A().notAFit(c), 'small') : null]);
    }));
  }

  // Customers and partners linked to registry data whose usual retirement month is this month or next.
  function askAboutPurchases(st) {
    const accounts = st.companies.filter(c => c.type !== 'prospect');
    if (!accounts.length) return null;
    const month = new Date().getMonth() + 1, rows = [];
    accounts.forEach(c => {
      const entry = S.dataEntry(c.ref), um = S.usualMonths(entry);
      if (!um) return;
      const ahead = (um.month - month + 12) % 12;
      if (ahead <= 1 && entry.last && daysSince(entry.last) > 150) rows.push({ c, um, entry, ahead });
    });
    const hint = 'Customers and partners that usually retire credits this month or next, and have not retired recently. Based on registry dates.';
    if (!rows.length) {
      const linked = accounts.some(c => S.usualMonths(S.dataEntry(c.ref)));
      return section('Time to ask about the next purchase', hint,
        el('p', { class: 'muted' }, linked ? 'None right now.' : 'Link accounts to their registry record to see their usual buying month.'));
    }
    return section('Time to ask about the next purchase', hint, rows.map(({ c, um, entry, ahead }) => rowcard(
      [el('a', { href: '#/company/' + c.id }, c.name), el('span', { class: 'muted' }, ` usually ${S.monthName(um.month)} (${um.years} of ${um.ofYears} years), last retired ${entry.last} `),
        ahead === 0 ? el('span', { class: 'tag warn' }, 'this month') : null],
      [btn('Log that I asked', () => A().logTouch(c, { note: 'Asked about the next purchase' }), 'small'),
        btn('Remind me in a week', () => A().snooze(c, 'nextTouch', 7), 'small')])));
  }

  function eventsSoon(st) {
    const T = today(), end = addDays(T, 60);
    const list = st.events.filter(e => e.date && e.date >= T && e.date <= end).sort((a, z) => a.date.localeCompare(z.date));
    if (!st.events.length) return null;
    if (!list.length) return section('Events in the next 60 days', null, el('p', { class: 'muted' }, 'None.'));
    return section('Events in the next 60 days', null,
      table(['Event', 'Date', { t: 'Outreach not started', cls: 'num' }, { t: 'Open tasks', cls: 'num hide-sm' }],
        list.map(e => el('tr', {},
          el('td', { class: 'name' }, el('a', { href: '#/event/' + e.id }, e.name)),
          el('td', { class: 'date' }, `${e.date} (in ${daysBetween(T, e.date)} days)`),
          el('td', { class: 'num' }, window.TWEvents.notStarted(e)), el('td', { class: 'num hide-sm' }, window.TWEvents.openFollowUps(e))))));
  }

  /* ---------- lead cards from the registry data ---------- */
  function leadCards(st) {
    const D = window.TW_DATA;
    if (!D) return null;
    const have = new Set(st.companies.map(c => S.nameKey(c.name)));
    // Scored by the lead ranking, best fit first.
    const pool = [];
    window.TWScore.rank('new').forEach(r => pool.push({ e: r.e, r, type: 'prospect', ref: 'lead', tag: 'Retired other proponents\' credits' }));
    window.TWScore.rank('repeat').forEach(r => pool.push({ e: r.e, r, type: 'customer', ref: 'buyer', tag: 'Retired Tradewater credits' }));
    const list = pool.filter(p => !have.has(S.nameKey(p.e.name)))
      .sort((a, z) => z.r.score - a.r.score || z.e.total - a.e.total);
    if (!list.length) return null;
    const PAGE = 6;
    const start = ui.leadOffset % list.length;
    const shown = list.slice(start, start + PAGE).concat(start + PAGE > list.length ? list.slice(0, start + PAGE - list.length) : []).slice(0, PAGE);

    const cards = shown.map(({ e, r, type, ref, tag }) => {
      const um = S.usualMonths(e);
      const latest = e.tx.slice(0, 3).map(t => `${t[0] || 'no date'}: ${fmt(t[1])} credits`);
      const label = type === 'prospect' ? 'Add as target' : 'Add as customer';
      return el('div', { class: 'lead-card' },
        el('b', {}, e.name),
        el('div', {}, el('span', { class: 'tag' }, tag), el('span', { class: 'tag' }, 'fit ' + r.score)),
        el('p', { class: 'muted' }, `${fmt(e.total)} credits retired, last on ${e.last || 'an unknown date'}.`),
        el('p', { class: 'muted' }, (window.TWScore.topReasons(r, 2).join('; ') || 'A weak match') + '.'),
        el('details', {}, el('summary', {}, 'Peek at their history'),
          el('ul', { class: 'plain' },
            el('li', {}, `${e.count} retirement${e.count === 1 ? '' : 's'} over ${e.yearsActive} year${e.yearsActive === 1 ? '' : 's'}, ${e.first || '?'} to ${e.last || '?'}.`),
            um ? el('li', {}, `Usually retires in ${S.monthName(um.month)} (${um.years} of ${um.ofYears} years).`) : null,
            el('li', {}, 'Latest: ' + latest.join('; ') + '.'))),
        el('div', { class: 'row-actions' },
          btn(label, () => {
            S.addCompany({ name: e.name, type, status: type === 'prospect' ? 'New' : 'Active', ref: { type: ref, id: e.id } });
            const c = S.findCompanyByName(e.name);
            flash(`Added ${e.name} as a ${type === 'prospect' ? 'target' : 'customer'}.`, '#/company/' + c.id);
          }, 'small'),
          el('a', { href: (ref === 'lead' ? '#/lead/' : '#/buyer/') + encodeURIComponent(e.id) }, 'Full history')));
    });
    return section('Leads from the registry data',
      `Real companies from registry records, best fit first. Peek at their history and add the ones worth reaching out to. Data is a snapshot to ${D.generatedAt.slice(0, 10)}. Names may have bought through a partner, so check before contacting. `,
      el('p', {}, el('a', { href: '#/ranking' }, 'See the full ranking and how it is scored')),
      el('div', { class: 'lead-grid' }, cards),
      list.length > PAGE ? el('p', {}, btn('Show other leads', () => { ui.leadOffset += PAGE; K.refresh(); }, 'small'), el('span', { class: 'muted' }, ` ${list.length} available`)) : null);
  }

  /* ---------- the page ---------- */
  function weekPage() {
    document.title = 'This week | Tradewater Sales Tool';
    const st = S.state();
    const empty = !st.companies.length && !st.deals.length && !st.events.length && !st.calls.length;
    const root = el('div');
    root.append(el('h1', {}, 'This week'),
      el('p', { class: 'lede' }, new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        '. Your entries are saved in this browser only.'));
    if (!S.isPersistent()) root.append(el('p', { class: 'note' }, 'This browser is blocking storage, so what you enter will not be saved after you close the page. Export a backup from Settings often, or open the site in a normal window.'));

    root.append(quickAdd(empty));
    const sparse = st.companies.length + st.deals.length < 3;
    const leads = leadCards(st);
    if (sparse && leads) root.append(leads);

    if (!empty) {
      root.append(remindersSection());

      const since = addDays(today(), -6);
      const touches = st.companies.reduce((n, c) => n + c.touches.filter(t => t.date >= since && t.date <= today()).length, 0);
      const goal = st.settings.weeklyGoal;
      const goalIn = el('input', { type: 'number', min: '0', value: goal || '', placeholder: 'No goal', 'aria-label': 'Weekly touch goal' });
      goalIn.addEventListener('change', () => { st.settings.weeklyGoal = Math.max(0, parseInt(goalIn.value, 10) || 0); S.save(); S.redraw(); });
      root.append(section('Outreach in the last 7 days', null,
        el('ul', { class: 'facts' },
          el('li', {}, el('b', {}, touches), el('span', {}, goal ? `touches logged of ${goal}` : 'touches logged')),
          el('li', {}, el('b', {}, st.deals.filter(S.isOpenDeal).length), el('span', {}, 'open deals')),
          el('li', {}, el('b', {}, st.companies.filter(c => c.type === 'prospect' && c.status !== 'Not a fit').length), el('span', {}, 'active targets'))),
        el('div', { class: 'controls' }, el('label', {}, 'Weekly touch goal', goalIn)),
        goal && touches < goal ? el('p', { class: 'muted' }, `${goal - touches} more to reach your goal.`) : null));

      root.append(dealsAttention(st), touchesDue(st));
      const ask = askAboutPurchases(st); if (ask) root.append(ask);
      const ev = eventsSoon(st); if (ev) root.append(ev);
      if (!sparse && leads) root.append(leads);

      const stale = !st.lastExport || daysSince(st.lastExport) > 14;
      if (stale) root.append(el('p', { class: 'note' }, st.lastExport ? `Your last backup was ${daysSince(st.lastExport)} days ago. ` : 'You have not exported a backup yet. ',
        el('a', { href: '#/settings' }, 'Export one in Settings'), '. Clearing browser data would erase your entries.'));
    }
    return root;
  }
  window.TWPages.week = weekPage;
  window.TWPages.week.section = 'week';
})();
