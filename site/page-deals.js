// Deals list, deal detail, and the "needs attention" rules shared with the weekly review.
(function () {
  const K = window.TWKit, S = window.TWStore, C = S.consts;
  const { el, fmt, btn, field, input, textarea, select, today, daysSince } = K;
  const go = hash => { location.hash = hash; };

  // Why a deal needs attention. Used here and on the This week page.
  function flags(d) {
    const st = S.state().settings, out = [];
    if (!d.nextStep) out.push('No next step');
    if (d.nextStepDate && d.nextStepDate < today()) out.push('Next step overdue');
    const quiet = daysSince(d.lastTouch || d.createdAt);
    if (quiet !== null && quiet >= st.quietDays) out.push(`Quiet for ${quiet} days`);
    return out;
  }
  const companyName = d => { const c = S.findCompany(d.companyId); return c ? c.name : d.companyName || ''; };

  function companyDatalist(id) {
    return el('datalist', { id }, S.state().companies.map(c => el('option', { value: c.name })));
  }

  function listPage() {
    document.title = 'Deals | Tradewater sales tool';
    const root = el('div');
    root.append(el('h1', {}, 'Deals'),
      el('p', { class: 'lede' }, 'Companies considering a purchase. Keep a next step on every open deal so none go quiet.'));

    const nameIn = el('input', { type: 'text', placeholder: 'Deal name', 'aria-label': 'Deal name' });
    const compIn = el('input', { type: 'text', list: 'deal-companies', placeholder: 'Company', 'aria-label': 'Company' });
    const stageSel = select(C.OPEN_STAGES, 'Initial meeting', () => {}, { 'aria-label': 'Stage' });
    const add = () => {
      const company = compIn.value.trim();
      const name = nameIn.value.trim() || company;
      if (!name) { nameIn.focus(); return; }
      const c = company ? S.findCompanyByName(company) : null;
      const d = S.addDeal({ name, stage: stageSel.value, companyId: c ? c.id : '', companyName: c ? '' : company });
      go('#/deal/' + d.id);
    };
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Add a deal', nameIn), el('label', {}, 'Company', compIn), el('label', {}, 'Stage', stageSel),
      el('label', {}, ' ', btn('Add', add, 'primary'))), companyDatalist('deal-companies'));

    const deals = S.state().deals;
    if (!deals.length) {
      root.append(el('p', { class: 'empty' }, 'No deals yet. Add the first company that is considering a purchase.'));
      return root;
    }
    const table = list => el('div', { class: 'scroll' }, el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, 'Deal'), el('th', { class: 'hide-sm' }, 'Company'), el('th', { class: 'num hide-sm' }, 'Credits'),
        el('th', {}, 'Next step'), el('th', {}, 'Due'), el('th', {}, 'Flags'))),
      el('tbody', {}, list.map(d => el('tr', {},
        el('td', { class: 'name' }, el('a', { href: '#/deal/' + d.id }, d.name || 'Untitled deal')),
        el('td', { class: 'hide-sm muted' }, companyName(d)),
        el('td', { class: 'num hide-sm' }, d.credits ? fmt(Number(d.credits) || 0) : ''),
        el('td', {}, d.nextStep || ''),
        el('td', { class: 'date' }, d.nextStepDate || ''),
        el('td', {}, S.isOpenDeal(d) ? flags(d).map(f => el('span', { class: 'tag warn' }, f)) : null))))));

    C.OPEN_STAGES.forEach(stage => {
      const list = deals.filter(d => d.stage === stage).sort((a, z) => (a.nextStepDate || '9999').localeCompare(z.nextStepDate || '9999'));
      root.append(el('h2', {}, `${stage} (${list.length})`), list.length ? table(list) : el('p', { class: 'muted' }, 'None.'));
    });
    const closed = deals.filter(d => !S.isOpenDeal(d));
    if (closed.length) root.append(el('h2', {}, `Closed (${closed.length})`), table(closed));
    return root;
  }

  function dealPage(id) {
    const d = S.findDeal(id);
    if (!d) return el('div', {}, el('a', { class: 'back', href: '#/deals' }, '← Deals'), el('p', { class: 'empty' }, 'Deal not found.'));
    document.title = (d.name || 'Deal') + ' | Tradewater sales tool';
    const set = (k, v) => { d[k] = v; S.save(); };
    const root = el('div');
    root.append(el('a', { class: 'back', href: '#/deals' }, '← Deals'), el('h1', {}, d.name || 'Untitled deal'));

    const compIn = input(companyName(d), v => {
      const c = v.trim() ? S.findCompanyByName(v) : null;
      d.companyId = c ? c.id : ''; d.companyName = c ? '' : v.trim(); S.save(); S.redraw();
    }, { list: 'deal-companies' });
    root.append(el('div', { class: 'form-grid' },
      field('Deal name', input(d.name, v => { set('name', v.trim()); document.querySelector('h1').textContent = v.trim() || 'Untitled deal'; })),
      field('Company', compIn, S.findCompany(d.companyId) ? null : (d.companyName ? 'Not in your targets or accounts yet' : null)),
      field('Stage', select(C.DEAL_STAGES, d.stage, v => {
        d.stage = v; if (!S.isOpenDeal(d) && !d.closedAt) d.closedAt = today(); S.save(); S.redraw();
      })),
      field('Credits', input(d.credits, v => set('credits', v), { type: 'number', min: '0' })),
      field('Next step', input(d.nextStep, v => { set('nextStep', v); S.redraw(); })),
      field('Next step due', input(d.nextStepDate, v => { set('nextStepDate', v); S.redraw(); }, { type: 'date' })),
      field('Remind me', S.remindField(d, 'nextStepRemind'))),
      companyDatalist('deal-companies'));
    root.append(field('Terms and details', textarea(d.terms, v => set('terms', v), { rows: 3 }), 'Price, vintage, project types, timing, who decides.'));
    root.append(field('Notes', textarea(d.notes, v => set('notes', v), { rows: 4 })));

    if (S.isOpenDeal(d)) {
      const f = flags(d);
      if (f.length) root.append(el('p', {}, f.map(x => el('span', { class: 'tag warn' }, x))));
    }
    root.append(el('p', {},
      btn('Draft a follow-up email', () => go('#/content/templates/deal/' + d.id)), ' ',
      btn('Due diligence answers', () => go('#/content/library'))));

    root.append(el('h2', {}, 'Log'));
    const lDate = el('input', { type: 'date', value: today(), 'aria-label': 'Date' });
    const lText = el('input', { type: 'text', placeholder: 'Call, email, what was agreed', 'aria-label': 'Entry' });
    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Date', lDate), el('label', {}, 'Entry', lText),
      el('label', {}, ' ', btn('Add to log', () => {
        if (!lDate.value || !lText.value.trim()) return;
        d.log.push({ date: lDate.value, text: lText.value.trim() });
        d.lastTouch = d.log.map(x => x.date).sort().pop();
        S.save(); S.redraw();
      }, 'primary'))));
    const log = d.log.slice().sort((a, z) => z.date.localeCompare(a.date));
    root.append(log.length
      ? el('div', { class: 'scroll' }, el('table', {}, el('tbody', {}, log.map(x => el('tr', {},
        el('td', { class: 'date' }, x.date), el('td', {}, x.text),
        el('td', {}, btn('Delete', () => {
          d.log.splice(d.log.indexOf(x), 1);
          d.lastTouch = d.log.map(e => e.date).sort().pop() || '';
          S.save(); S.redraw();
        }, 'small')))))))
      : el('p', { class: 'muted' }, 'Nothing logged yet.'));

    root.append(el('h2', {}, 'Delete'), el('p', {}, btn('Delete this deal', () => {
      if (window.confirm('Delete this deal and its log?')) { S.state().deals = S.state().deals.filter(x => x.id !== d.id); S.save(); go('#/deals'); }
    }, 'danger')));
    return root;
  }

  window.TWDeals = { flags, companyName };
  window.TWPages.deals = listPage;
  window.TWPages.deals.section = 'deals';
  window.TWPages.deal = dealPage;
  window.TWPages.deal.section = 'deals';
})();
