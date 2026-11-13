// "This week": the page Eli opens first. Everything on it is derived from what is entered plus the registry data.
(function () {
  const K = window.TWKit, S = window.TWStore, C = S.consts;
  const { el, fmt, btn, today, addDays, daysSince, daysBetween } = K;

  const section = (title, hint, ...kids) => el('div', {}, el('h2', {}, title), hint ? el('p', { class: 'muted' }, hint) : null, ...kids);
  const table = (head, rows) => el('div', { class: 'scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, head.map(h => el('th', { class: h.cls || '' }, h.t || h)))),
    el('tbody', {}, rows)));

  function dealsAttention(st) {
    const rows = st.deals.filter(S.isOpenDeal)
      .map(d => ({ d, f: window.TWDeals.flags(d) }))
      .filter(x => x.f.length)
      .sort((a, z) => z.f.length - a.f.length || (a.d.nextStepDate || '9999').localeCompare(z.d.nextStepDate || '9999'));
    const open = st.deals.filter(S.isOpenDeal).length;
    if (!open) return section('Open deals needing a next step', null,
      el('p', { class: 'muted' }, 'No open deals. '), el('a', { href: '#/deals' }, 'Add a deal'));
    if (!rows.length) return section('Open deals needing a next step', null, el('p', {}, `All ${open} open deals have a next step and recent contact.`));
    return section('Open deals needing a next step', `${rows.length} of ${open} open deals need attention.`,
      table(['Deal', { t: 'Stage', cls: 'hide-sm' }, 'Flags', { t: 'Next step', cls: 'hide-sm' }],
        rows.map(({ d, f }) => el('tr', {},
          el('td', { class: 'name' }, el('a', { href: '#/deal/' + d.id }, d.name || 'Untitled deal'), el('span', { class: 'muted' }, ' ' + window.TWDeals.companyName(d))),
          el('td', { class: 'hide-sm' }, d.stage),
          el('td', {}, f.map(x => el('span', { class: 'tag warn' }, x))),
          el('td', { class: 'hide-sm muted' }, d.nextStep || '')))));
  }

  function touchesDue(st) {
    const T = today(), nd = st.settings.nurtureDays, rows = [];
    st.companies.forEach(c => {
      if (c.status === 'Not a fit') return;
      if (c.nextTouch && c.nextTouch <= T) rows.push({ c, why: c.nextTouch === T ? 'Next touch is today' : `Next touch was due ${c.nextTouch}`, sort: c.nextTouch });
      else if (!c.nextTouch && c.lastTouch && daysSince(c.lastTouch) >= nd && (c.type !== 'prospect' || ['Contacted', 'Nurturing', 'Meeting booked'].includes(c.status)))
        rows.push({ c, why: `No touch for ${daysSince(c.lastTouch)} days`, sort: c.lastTouch });
    });
    rows.sort((a, z) => a.sort.localeCompare(z.sort));
    if (!rows.length) return section('Reach out or nurture', `Companies with a next touch due, or not touched for ${nd} days.`, el('p', {}, 'Nothing is due.'));
    return section('Reach out or nurture', `Companies with a next touch due, or not touched for ${nd} days.`,
      table(['Company', 'Why', { t: 'Planned channel', cls: 'hide-sm' }],
        rows.map(({ c, why }) => el('tr', {},
          el('td', { class: 'name' }, el('a', { href: '#/company/' + c.id }, c.name), el('span', { class: 'tag' }, c.type === 'prospect' ? 'target' : c.type)),
          el('td', {}, why), el('td', { class: 'hide-sm muted' }, c.channel || '')))));
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
    return section('Time to ask about the next purchase', hint,
      table(['Account', 'Usual month', { t: 'Last retirement', cls: 'hide-sm' }],
        rows.map(({ c, um, entry, ahead }) => el('tr', {},
          el('td', { class: 'name' }, el('a', { href: '#/company/' + c.id }, c.name)),
          el('td', {}, `${S.monthName(um.month)} (${um.years} of ${um.ofYears} years)`, ahead === 0 ? el('span', { class: 'tag warn' }, 'this month') : null),
          el('td', { class: 'hide-sm date' }, entry.last)))));
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

  // Latest retirements in the registry data, as a source of reasons to get in touch.
  function recentRetirements() {
    const D = window.TW_DATA;
    if (!D) return null;
    const from = addDays(D.generatedAt.slice(0, 10), -30);
    const rows = [];
    const scan = (list, source, base) => list.forEach(e => {
      if (e.kind !== 'buyer' && e.kind !== 'account') return;
      const recent = e.tx.filter(t => t[0] && t[0] >= from);
      if (!recent.length) return;
      rows.push({ e, source, base, qty: recent.reduce((s, t) => s + t[1], 0), date: recent.map(t => t[0]).sort().pop() });
    });
    scan(D.buyers, 'Tradewater credits', '#/buyer/');
    scan(D.leads, 'Other proponents\' credits', '#/lead/');
    rows.sort((a, z) => z.date.localeCompare(a.date));
    const hint = `Named buyers with retirements in the last 30 days of the data (to ${D.generatedAt.slice(0, 10)}). The data is a snapshot, so this is not today's news.`;
    if (!rows.length) return section('Recent retirements in the data', hint, el('p', { class: 'muted' }, 'None.'));
    return section('Recent retirements in the data', hint,
      table(['Company', { t: 'Credits', cls: 'num' }, 'Date', { t: 'Credits from', cls: 'hide-sm' }],
        rows.slice(0, 8).map(r => el('tr', {},
          el('td', { class: 'name' }, el('a', { href: r.base + encodeURIComponent(r.e.id) }, r.e.name)),
          el('td', { class: 'num' }, fmt(r.qty)), el('td', { class: 'date' }, r.date), el('td', { class: 'hide-sm muted' }, r.source)))));
  }

  function weekPage() {
    document.title = 'This week | Tradewater sales tool';
    const st = S.state();
    const root = el('div');
    root.append(el('h1', {}, 'This week'),
      el('p', { class: 'lede' }, new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        '. Your entries are saved in this browser only.'));

    if (!S.isPersistent()) root.append(el('p', { class: 'note' }, 'This browser is blocking storage, so what you enter will not be saved after you close the page. Export a backup from Settings often, or open the site in a normal window.'));

    if (!st.companies.length && !st.deals.length && !st.events.length) {
      root.append(el('div', { class: 'card' },
        el('h3', {}, 'Start with one small step'),
        el('ul', { class: 'plain' },
          el('li', {}, el('a', { href: '#/deals' }, 'Add a deal'), ' for a company that is considering a purchase now.'),
          el('li', {}, el('a', { href: '#/targets' }, 'Add a target'), ' or pick one from the suggestions built from the registry data.'),
          el('li', {}, el('a', { href: '#/events' }, 'Add the next event'), ' you might attend.'),
          el('li', {}, el('a', { href: '#/settings' }, 'Import a CSV'), ' if you already keep these in a spreadsheet.'))));
    }

    // Reminders from the calendar: items inside their own reminder window, then the rest of the next 7 days.
    if (window.TWAgenda) {
      const all = window.TWAgenda.items();
      const due = window.TWAgenda.reminders();
      const dueSet = new Set(due);
      const soon = all.filter(i => i.days >= 0 && i.days <= 7 && !dueSet.has(i));
      root.append(section('Reminders', 'Calls, events, deal steps and touches inside their reminder window, plus anything overdue.',
        due.length ? window.TWAgenda.itemTable(due, true) : el('p', {}, 'Nothing is due inside its reminder window.'),
        soon.length ? el('h3', {}, 'Later this week') : null,
        soon.length ? window.TWAgenda.itemTable(soon, true) : null,
        el('p', {}, el('a', { href: '#/calendar' }, 'Open the calendar'))));
    }

    // Outreach count against the weekly goal
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
      goal && touches < goal ? el('p', { class: 'muted' }, `${goal - touches} more to reach your goal. Log touches on each company page.`) : null));

    root.append(dealsAttention(st), touchesDue(st));
    const ask = askAboutPurchases(st); if (ask) root.append(ask);
    const ev = eventsSoon(st); if (ev) root.append(ev);
    const rec = recentRetirements(); if (rec) root.append(rec);

    const stale = (st.companies.length || st.deals.length || st.events.length) && (!st.lastExport || daysSince(st.lastExport) > 14);
    if (stale) root.append(el('p', { class: 'note' }, st.lastExport ? `Your last backup was ${daysSince(st.lastExport)} days ago. ` : 'You have not exported a backup yet. ',
      el('a', { href: '#/settings' }, 'Export one in Settings'), '. Clearing browser data would erase your entries.'));
    return root;
  }
  window.TWPages.week = weekPage;
  window.TWPages.week.section = 'week';
})();
