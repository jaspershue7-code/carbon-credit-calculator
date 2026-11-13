// Conferences and events: who is going, outreach before, follow-up after.
(function () {
  const K = window.TWKit, S = window.TWStore, C = S.consts;
  const { el, btn, field, input, textarea, select, today } = K;
  const go = hash => { location.hash = hash; };

  const notStarted = e => e.attendees.filter(a => a.outreach === 'Not started').length;
  const openFollowUps = e => e.followUps.filter(f => !f.done).length;

  function listPage() {
    document.title = 'Events | Tradewater sales tool';
    const root = el('div');
    root.append(el('h1', {}, 'Events'),
      el('p', { class: 'lede' }, 'Conferences and events. Reach out to targets, customers and partners before, choose panels, and follow up fast afterwards.'));
    const nameIn = el('input', { type: 'text', placeholder: 'Event name', 'aria-label': 'Event name' });
    const dateIn = el('input', { type: 'date', 'aria-label': 'Date' });
    const locIn = el('input', { type: 'text', placeholder: 'City or venue', 'aria-label': 'Location' });
    const add = () => {
      if (!nameIn.value.trim()) { nameIn.focus(); return; }
      const e = S.addEvent({ name: nameIn.value.trim(), date: dateIn.value, location: locIn.value.trim() });
      go('#/event/' + e.id);
    };
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Add an event', nameIn), el('label', {}, 'Date', dateIn), el('label', {}, 'Location', locIn),
      el('label', {}, ' ', btn('Add', add, 'primary'))));

    const events = S.state().events;
    if (!events.length) { root.append(el('p', { class: 'empty' }, 'No events yet. Add the next conference you might attend.')); return root; }
    const t = today();
    const table = list => el('div', { class: 'scroll' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Event'), el('th', {}, 'Date'), el('th', { class: 'hide-sm' }, 'Location'),
        el('th', { class: 'num' }, 'Going'), el('th', { class: 'num' }, 'Outreach not started'), el('th', { class: 'num hide-sm' }, 'Follow-ups open'))),
      el('tbody', {}, list.map(e => el('tr', {},
        el('td', { class: 'name' }, el('a', { href: '#/event/' + e.id }, e.name)),
        el('td', { class: 'date' }, e.date || 'no date'),
        el('td', { class: 'hide-sm muted' }, e.location),
        el('td', { class: 'num' }, e.attendees.length), el('td', { class: 'num' }, notStarted(e)),
        el('td', { class: 'num hide-sm' }, openFollowUps(e)))))));
    const upcoming = events.filter(e => !e.date || e.date >= t).sort((a, z) => (a.date || '9999').localeCompare(z.date || '9999'));
    const past = events.filter(e => e.date && e.date < t).sort((a, z) => z.date.localeCompare(a.date));
    root.append(el('h2', {}, `Upcoming (${upcoming.length})`), upcoming.length ? table(upcoming) : el('p', { class: 'muted' }, 'None.'));
    if (past.length) root.append(el('h2', {}, `Past (${past.length})`), table(past));
    return root;
  }

  function eventPage(id) {
    const e = S.findEvent(id);
    if (!e) return el('div', {}, el('a', { class: 'back', href: '#/events' }, '← Events'), el('p', { class: 'empty' }, 'Event not found.'));
    document.title = e.name + ' | Tradewater sales tool';
    const set = (k, v) => { e[k] = v; S.save(); };
    const root = el('div');
    root.append(el('a', { class: 'back', href: '#/events' }, '← Events'), el('h1', {}, e.name));
    root.append(el('div', { class: 'form-grid' },
      field('Name', input(e.name, v => { if (v.trim()) { set('name', v.trim()); document.querySelector('h1').textContent = v.trim(); } })),
      field('Date', input(e.date, v => { set('date', v); }, { type: 'date' })),
      field('Location', input(e.location, v => set('location', v))),
      field('Link', input(e.url, v => set('url', v), { placeholder: 'https://' })),
      field('Remind me', S.remindField(e, 'remindDays'))),
      /^https?:\/\//.test(e.url || '') ? el('p', {}, el('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'Open event page')) : null);
    root.append(field('Notes', textarea(e.notes, v => set('notes', v), { rows: 3 })));

    // Attendees
    const sent = e.attendees.filter(a => a.outreach !== 'Not started').length;
    root.append(el('h2', {}, `Who is going (${e.attendees.length})`),
      e.attendees.length ? el('p', { class: 'muted' }, `${sent} of ${e.attendees.length} contacted so far.`) : el('p', { class: 'muted' }, 'Add targets, customers and partners who are going or may be going.'));
    e.attendees.forEach((a, i) => root.append(el('div', { class: 'person' },
      el('div', { class: 'form-grid' },
        field('Name or company', input(a.name, v => { a.name = v; S.save(); })),
        field('Kind', select(C.ATTENDEE_KINDS, a.kind, v => { a.kind = v; S.save(); })),
        field('Outreach', select(C.OUTREACH_STATUS, a.outreach, v => { a.outreach = v; S.save(); S.redraw(); })),
        field('Note', input(a.note, v => { a.note = v; S.save(); }))),
      el('p', {}, S.findCompanyByName(a.name) ? el('a', { href: '#/company/' + S.findCompanyByName(a.name).id }, 'Open company') : null, ' ',
        btn('Remove', () => { e.attendees.splice(i, 1); S.save(); S.redraw(); }, 'small')))));
    const names = new Set(e.attendees.map(a => S.nameKey(a.name)));
    const available = S.state().companies.filter(c => !names.has(S.nameKey(c.name)));
    const pick = select([['', 'Add from my companies'], ...available.map(c => [c.id, c.name])], '', () => {}, { 'aria-label': 'Add from my companies' });
    pick.addEventListener('change', () => {
      const c = S.findCompany(pick.value);
      if (!c) return;
      e.attendees.push({ name: c.name, kind: c.type === 'prospect' ? 'target' : c.type, outreach: 'Not started', note: '' });
      S.save(); S.redraw();
    });
    const custom = el('input', { type: 'text', placeholder: 'Someone else', 'aria-label': 'Someone else' });
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'From my companies', pick), el('label', {}, 'Or type a name', custom),
      el('label', {}, ' ', btn('Add', () => {
        if (!custom.value.trim()) return;
        e.attendees.push({ name: custom.value.trim(), kind: 'other', outreach: 'Not started', note: '' });
        S.save(); S.redraw();
      }))));

    // Panels
    root.append(el('h2', {}, 'Panels and sessions'));
    if (!e.panels.length) root.append(el('p', { class: 'muted' }, 'List the sessions that look useful, then tick the ones you will attend.'));
    e.panels.forEach((p, i) => root.append(el('div', { class: 'person' },
      el('div', { class: 'form-grid' },
        field('Session', input(p.title, v => { p.title = v; S.save(); })),
        field('When', input(p.time, v => { p.time = v; S.save(); }, { placeholder: 'Day and time' })),
        field('Note', input(p.note, v => { p.note = v; S.save(); }))),
      el('p', {}, el('label', { class: 'check' }, (() => {
        const cb = el('input', { type: 'checkbox', checked: !!p.going });
        cb.addEventListener('change', () => { p.going = cb.checked; S.save(); });
        return cb;
      })(), ' Going'), ' ', btn('Remove', () => { e.panels.splice(i, 1); S.save(); S.redraw(); }, 'small')))));
    root.append(btn('Add a session', () => { e.panels.push({ title: '', time: '', note: '', going: true }); S.save(); S.redraw(); }));

    // Checklist
    root.append(el('h2', {}, `Checklist (${openFollowUps(e)} open)`));
    e.followUps.forEach((f, i) => root.append(el('div', { class: 'check-row' },
      el('label', { class: 'check' }, (() => {
        const cb = el('input', { type: 'checkbox', checked: !!f.done });
        cb.addEventListener('change', () => { f.done = cb.checked; S.save(); S.redraw(); });
        return cb;
      })(), ' ', el('span', { class: f.done ? 'done' : '' }, f.text)),
      ' ', btn('Remove', () => { e.followUps.splice(i, 1); S.save(); S.redraw(); }, 'small'))));
    const newItem = el('input', { type: 'text', placeholder: 'Add a task', 'aria-label': 'New task' });
    root.append(el('div', { class: 'controls' }, el('label', {}, 'New task', newItem),
      el('label', {}, ' ', btn('Add', () => {
        if (!newItem.value.trim()) return;
        e.followUps.push({ text: newItem.value.trim(), done: false }); S.save(); S.redraw();
      }))));
    root.append(el('p', {}, btn('Draft a post-event follow-up', () => go('#/content/templates')), ' ',
      btn('Draft pre-event outreach', () => go('#/content/templates'))));

    root.append(el('h2', {}, 'Delete'), el('p', {}, btn('Delete this event', () => {
      if (window.confirm(`Delete ${e.name}?`)) { S.state().events = S.state().events.filter(x => x.id !== e.id); S.save(); go('#/events'); }
    }, 'danger')));
    return root;
  }

  window.TWEvents = { notStarted, openFollowUps };
  window.TWPages.events = listPage;
  window.TWPages.events.section = 'events';
  window.TWPages.event = eventPage;
  window.TWPages.event.section = 'events';
})();
