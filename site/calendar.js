// Calendar, agenda and reminders. Gathers every dated item in the tool into one list.
(function () {
  const K = window.TWKit, S = window.TWStore;
  const { el, btn, field, input, textarea, select, today, addDays, daysBetween } = K;
  const go = hash => { location.hash = hash; };
  const remindOf = (obj, key) => (obj[key] == null ? 1 : Number(obj[key]));

  const fmtTime = t => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const dayLabel = date => K.parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const relative = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? `in ${n} days` : n === -1 ? '1 day overdue' : `${-n} days overdue`;
  const remindText = r => (r === 0 ? 'reminds on the day' : r === 7 ? 'reminds 1 week before' : `reminds ${r} day${r === 1 ? '' : 's'} before`);

  /* ---------- the agenda engine ---------- */
  function items() {
    const st = S.state(), out = [];
    const compName = (id, fallback) => { const c = S.findCompany(id); return c ? c.name : fallback || ''; };

    st.calls.filter(c => !c.done && c.date).forEach(c => out.push({
      ref: { type: 'call', id: c.id }, kind: 'Call or meeting', date: c.date, time: c.time, title: c.title || 'Untitled', href: '#/call/' + c.id,
      sub: compName(c.companyId, c.companyName), remind: remindOf(c, 'remindDays'), movable: true,
    }));
    st.events.filter(e => e.date).forEach(e => out.push({
      ref: { type: 'event', id: e.id }, kind: 'Event', date: e.date, time: '', title: e.name, href: '#/event/' + e.id,
      sub: `${window.TWEvents.notStarted(e)} outreach not started, ${window.TWEvents.openFollowUps(e)} tasks open`,
      remind: remindOf(e, 'remindDays'), expires: true,
    }));
    st.deals.filter(d => S.isOpenDeal(d) && d.nextStepDate).forEach(d => out.push({
      ref: { type: 'deal', id: d.id }, kind: 'Deal next step', date: d.nextStepDate, time: '', title: `${d.nextStep || 'Next step'}: ${d.name || 'Untitled deal'}`, href: '#/deal/' + d.id,
      sub: compName(d.companyId, d.companyName), remind: remindOf(d, 'nextStepRemind'),
    }));
    st.companies.filter(c => c.nextTouch && c.status !== 'Not a fit').forEach(c => out.push({
      ref: { type: 'company', id: c.id }, kind: 'Touch', date: c.nextTouch, time: '', title: 'Reach out: ' + c.name, href: '#/company/' + c.id,
      sub: c.channel || '', remind: remindOf(c, 'nextTouchRemind'),
    }));
    out.forEach(i => { i.days = daysBetween(today(), i.date); });
    // Past events are history, not overdue work.
    return out.filter(i => !(i.expires && i.days < 0)).sort((a, z) => a.date.localeCompare(z.date) || (a.time || '99').localeCompare(z.time || '99'));
  }
  // Items inside their reminder window, including overdue ones.
  const reminders = () => items().filter(i => i.days <= i.remind);

  /* ---------- shared row ---------- */
  // One-click buttons for an agenda item.
  function actionsFor(i) {
    const A = window.TWActions, R = i.ref;
    if (!R) return [];
    const snz = (obj, key) => btn('Snooze 1 day', () => A.snooze(obj, key, 1), 'small');
    if (R.type === 'call') {
      const c = S.findCall(R.id);
      return c ? [btn('Done', () => A.callDone(c, false), 'small'), S.findCompany(c.companyId) ? btn('Done and log touch', () => A.callDone(c, true), 'small') : null, snz(c, 'date')] : [];
    }
    if (R.type === 'deal') { const d = S.findDeal(R.id); return d ? [btn('Step done', () => A.stepDone(d), 'small'), snz(d, 'nextStepDate')] : []; }
    if (R.type === 'company') { const c = S.findCompany(R.id); return c ? [btn('Log touch', () => A.logTouch(c), 'small'), snz(c, 'nextTouch')] : []; }
    return [];
  }

  function itemRow(i, withDate, withActions) {
    return el('tr', {},
      withDate ? el('td', { class: 'date' }, dayLabel(i.date), el('br'), el('span', { class: i.days < 0 ? 'tag warn' : 'muted' }, relative(i.days))) : null,
      el('td', { class: 'date' }, fmtTime(i.time)),
      el('td', {}, el('span', { class: 'tag' }, i.kind)),
      el('td', { class: 'name' }, el('a', { href: i.href }, i.title), i.sub ? el('span', { class: 'muted' }, ' ' + i.sub) : null),
      el('td', { class: 'hide-sm muted' }, remindText(i.remind)),
      withActions ? el('td', { class: 'row-actions' }, actionsFor(i)) : null);
  }
  const itemTable = (list, withDate, withActions) => el('div', { class: 'scroll' }, el('table', {}, el('tbody', {}, list.map(i => itemRow(i, withDate, withActions)))));

  /* ---------- calendar page ---------- */
  const view = { ym: '', sel: '' };

  function monthGrid(ym, all) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
    const byDate = {};
    all.forEach(i => { (byDate[i.date] = byDate[i.date] || []).push(i); });
    const grid = el('div', { class: 'cal', role: 'grid', 'aria-label': 'Month' });
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => grid.append(el('div', { class: 'dow' }, d)));
    for (let i = 0; i < first.getDay(); i++) grid.append(el('div', { class: 'day out' }));
    for (let d = 1; d <= daysIn; d++) {
      const date = `${ym}-${String(d).padStart(2, '0')}`;
      const list = byDate[date] || [];
      const over = list.some(i => i.days < 0);
      const cls = ['day', date === today() ? 'today' : '', date === view.sel ? 'sel' : ''].join(' ').trim();
      grid.append(el('button', {
        type: 'button', class: cls, 'aria-label': `${dayLabel(date)}, ${list.length} item${list.length === 1 ? '' : 's'}`,
        'aria-pressed': date === view.sel ? 'true' : 'false',
        onclick: () => { view.sel = date; K.refresh(); },
      }, el('b', {}, d), list.length ? el('span', { class: 'count' + (over ? ' over' : '') }, String(list.length)) : null));
    }
    return grid;
  }

  function calendarPage(arg) {
    document.title = 'Calendar | Tradewater sales tool';
    const T = today();
    if (/^\d{4}-\d{2}$/.test(arg)) { if (arg !== view.ym) { view.ym = arg; view.sel = ''; } }
    else if (view.ym !== T.slice(0, 7)) { view.ym = T.slice(0, 7); view.sel = ''; }
    if (!view.sel || !view.sel.startsWith(view.ym)) view.sel = view.ym === T.slice(0, 7) ? T : view.ym + '-01';
    const all = items();
    const [y, m] = view.ym.split('-').map(Number);
    const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
    const ymOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const root = el('div');
    root.append(el('h1', {}, 'Calendar'),
      el('p', { class: 'lede' }, 'Calls, meetings, events, deal next steps and next touches in one place. Each item has its own reminder.'));

    // Add a call or meeting
    const title = el('input', { type: 'text', placeholder: 'Call with whom, about what', 'aria-label': 'Title' });
    const date = el('input', { type: 'date', value: view.sel, 'aria-label': 'Date' });
    const time = el('input', { type: 'time', 'aria-label': 'Time' });
    const comp = el('input', { type: 'text', list: 'cal-companies', placeholder: 'Company', 'aria-label': 'Company' });
    const add = () => {
      if (!title.value.trim() && !comp.value.trim()) { title.focus(); return; }
      if (!date.value) { date.focus(); return; }
      const c = comp.value.trim() ? S.findCompanyByName(comp.value) : null;
      const call = S.addCall({ title: title.value.trim() || 'Call with ' + comp.value.trim(), date: date.value, time: time.value, companyId: c ? c.id : '', companyName: c ? '' : comp.value.trim() });
      go('#/call/' + call.id);
    };
    root.append(el('h2', {}, 'Add a call or meeting'),
      el('div', { class: 'controls' },
        el('label', {}, 'Title', title), el('label', {}, 'Date', date), el('label', {}, 'Time', time), el('label', {}, 'Company', comp),
        el('label', {}, ' ', btn('Add', add, 'primary'))),
      el('datalist', { id: 'cal-companies' }, S.state().companies.map(c => el('option', { value: c.name }))));

    // Reminders now
    const due = all.filter(i => i.days <= i.remind);
    if (due.length) root.append(el('h2', {}, `Reminders now (${due.length})`), itemTable(due, true, true));

    // Month
    root.append(el('div', { class: 'cal-head' },
      el('a', { href: '#/calendar/' + ymOf(prev) }, '← ' + prev.toLocaleDateString('en-US', { month: 'long' })),
      el('h2', { class: 'plainh' }, new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
      el('a', { href: '#/calendar/' + ymOf(next) }, next.toLocaleDateString('en-US', { month: 'long' }) + ' →')),
      el('p', {}, view.ym !== T.slice(0, 7) ? el('a', { href: '#/calendar/' + T.slice(0, 7), onclick: () => { view.sel = ''; } }, 'Back to this month') : null),
      monthGrid(view.ym, all));

    const dayItems = all.filter(i => i.date === view.sel);
    root.append(el('h2', {}, dayLabel(view.sel)),
      dayItems.length ? itemTable(dayItems, false) : el('p', { class: 'muted' }, 'Nothing on this day.'));

    // Agenda
    const overdue = all.filter(i => i.days < 0);
    const upcoming = all.filter(i => i.days >= 0 && i.days <= 30);
    root.append(el('h2', {}, 'Agenda'));
    if (overdue.length) root.append(el('h3', {}, 'Overdue'), itemTable(overdue, true, true));
    root.append(el('h3', {}, 'Next 30 days'), upcoming.length ? itemTable(upcoming, true) : el('p', { class: 'muted' }, 'Nothing in the next 30 days.'));
    if (!all.length) root.append(el('p', { class: 'empty' }, 'Nothing is scheduled yet. Add a call above, set a next step on a deal, or add an event.'));
    return root;
  }

  /* ---------- call detail ---------- */
  function callPage(id) {
    const c = S.findCall(id);
    if (!c) return el('div', {}, el('a', { class: 'back', href: '#/calendar' }, '← Calendar'), el('p', { class: 'empty' }, 'Call or meeting not found.'));
    document.title = (c.title || 'Call') + ' | Tradewater sales tool';
    const set = (k, v) => { c[k] = v; S.save(); };
    const root = el('div');
    root.append(el('a', { class: 'back', href: '#/calendar' }, '← Calendar'), el('h1', {}, c.title || 'Untitled'));
    const company = S.findCompany(c.companyId);
    const compIn = input(company ? company.name : c.companyName, v => {
      const x = v.trim() ? S.findCompanyByName(v) : null;
      c.companyId = x ? x.id : ''; c.companyName = x ? '' : v.trim(); S.save(); S.redraw();
    }, { list: 'call-companies' });
    root.append(el('div', { class: 'form-grid' },
      field('Title', input(c.title, v => { set('title', v.trim()); document.querySelector('h1').textContent = v.trim() || 'Untitled'; })),
      field('Date', input(c.date, v => set('date', v), { type: 'date' })),
      field('Time', input(c.time, v => set('time', v), { type: 'time' })),
      field('Company', compIn),
      field('Deal', select([['', 'No deal'], ...S.state().deals.map(d => [d.id, d.name || 'Untitled deal'])], c.dealId, v => set('dealId', v))),
      field('Remind me', S.remindField(c, 'remindDays'))),
      el('datalist', { id: 'call-companies' }, S.state().companies.map(x => el('option', { value: x.name }))));
    root.append(field('Notes, agenda, what to ask', textarea(c.notes, v => set('notes', v), { rows: 5 })));
    root.append(el('p', {}, c.done ? el('span', { class: 'tag' }, 'Done') : null));
    root.append(el('p', {},
      c.done
        ? btn('Mark not done', () => { set('done', false); S.redraw(); }, 'small')
        : btn('Mark done', () => { set('done', true); go('#/calendar'); }, 'small'), ' ',
      !c.done && company ? btn('Mark done and log a touch on ' + company.name, () => {
        S.logTouch(company, { date: c.date || today(), channel: 'Call', note: c.title });
        set('done', true); go('#/calendar');
      }, 'small') : null, ' ',
      company ? el('a', { href: '#/company/' + company.id }, 'Open company') : null));
    root.append(el('h2', {}, 'Delete'), el('p', {}, btn('Delete this call or meeting', () => {
      if (window.confirm('Delete this call or meeting?')) { S.state().calls = S.state().calls.filter(x => x.id !== c.id); S.save(); go('#/calendar'); }
    }, 'danger')));
    return root;
  }

  window.TWAgenda = { items, reminders, itemTable, relative, dayLabel, fmtTime };
  window.TWPages.calendar = calendarPage;
  window.TWPages.calendar.section = 'calendar';
  window.TWPages.call = callPage;
  window.TWPages.call.section = 'calendar';
})();
