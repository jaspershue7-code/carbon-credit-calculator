// Backup, import, and the few numbers that tune the weekly review.
(function () {
  const K = window.TWKit, S = window.TWStore, C = S.consts;
  const { el, btn, field, input, today } = K;

  function parseCsv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
    return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }
  const pick = (row, ...names) => { for (const n of names) if (row[n]) return row[n]; return ''; };
  const download = (name, text, type) => {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  };
  const readFile = (file, cb) => { const r = new FileReader(); r.onload = () => cb(String(r.result)); r.readAsText(file); };

  function importCompanies(text) {
    let added = 0, skipped = 0;
    parseCsv(text).forEach(r => {
      const name = pick(r, 'name', 'company');
      if (!name || S.findCompanyByName(name)) { skipped++; return; }
      const t = pick(r, 'type').toLowerCase();
      const type = ['customer', 'partner'].includes(t) ? t : 'prospect';
      const status = pick(r, 'status');
      S.addCompany({ name, type, status: S_valid(type, status), nextTouch: pick(r, 'next touch', 'next_touch'), notes: pick(r, 'notes') });
      added++;
    });
    return `${added} companies added, ${skipped} skipped (blank or already there).`;
  }
  const S_valid = (type, status) => {
    const list = type === 'prospect' ? C.PROSPECT_STATUS : C.ACCOUNT_STATUS;
    return list.find(s => s.toLowerCase() === status.toLowerCase()) || list[0];
  };
  function importDeals(text) {
    let added = 0, skipped = 0;
    parseCsv(text).forEach(r => {
      const name = pick(r, 'name', 'deal');
      const company = pick(r, 'company');
      if (!name && !company) { skipped++; return; }
      const c = company ? S.findCompanyByName(company) : null;
      const stage = C.DEAL_STAGES.find(s => s.toLowerCase() === pick(r, 'stage').toLowerCase()) || 'Initial meeting';
      S.addDeal({
        name: name || company, companyId: c ? c.id : '', companyName: c ? '' : company, stage,
        credits: pick(r, 'credits'), nextStep: pick(r, 'next step', 'next_step'), nextStepDate: pick(r, 'next step date', 'next_step_date'), notes: pick(r, 'notes'),
      });
      added++;
    });
    return `${added} deals added, ${skipped} skipped (no name or company).`;
  }

  function settingsPage() {
    document.title = 'Settings | Tradewater Sales Tool';
    const st = S.state();
    const root = el('div');
    root.append(el('h1', {}, 'Settings and backup'),
      el('p', { class: 'lede' }, 'Your entries live in this browser only. They are not sent anywhere and are not in the GitHub repository. Export a file to back them up or move to another computer.'));
    if (!S.isPersistent()) root.append(el('p', { class: 'note' }, 'This browser is blocking storage, so nothing is being saved. Export often.'));
    const msg = el('p', { class: 'muted', role: 'status' });
    const say = t => { msg.textContent = t; };

    root.append(el('h2', {}, 'Backup'),
      el('p', {}, `${st.companies.length} companies, ${st.deals.length} deals, ${st.events.length} events, ${st.calls.length} calls and meetings, ${st.qa.length} saved answers.` +
        (st.lastExport ? `Last export: ${st.lastExport}.` : 'Never exported.')),
      el('p', {}, btn('Export backup (JSON)', () => { download(`tradewater-tool-backup-${today()}.json`, S.exportJSON(), 'application/json'); S.redraw(); }, 'primary')));

    const jsonIn = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Backup file' });
    jsonIn.addEventListener('change', () => {
      const f = jsonIn.files[0]; if (!f) return;
      readFile(f, text => {
        let obj;
        try { obj = JSON.parse(text); } catch (e) { say('That file is not valid JSON, so nothing was changed.'); return; }
        if (!obj || !Array.isArray(obj.companies) || !Array.isArray(obj.deals) || !Array.isArray(obj.events)) { say('That file does not look like a backup from this tool, so nothing was changed.'); return; }
        if (!window.confirm(`Replace everything in this browser with the backup (${obj.companies.length} companies, ${obj.deals.length} deals, ${obj.events.length} events)?`)) return;
        S.replaceAll(obj); say('Backup restored.'); S.redraw();
      });
    });
    root.append(field('Restore from a backup', jsonIn, 'This replaces what is here now.'));

    root.append(el('h2', {}, 'Import from a spreadsheet (CSV)'),
      el('p', { class: 'muted' }, 'Save your sheet as CSV with a header row. Companies: name, type (target, customer or partner), status, next touch (YYYY-MM-DD), notes. Deals: name, company, stage, credits, next step, next step date, notes. Existing companies are not overwritten.'));
    const cIn = el('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Companies CSV' });
    cIn.addEventListener('change', () => { const f = cIn.files[0]; if (f) readFile(f, t => { say(importCompanies(t)); }); });
    const dIn = el('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Deals CSV' });
    dIn.addEventListener('change', () => { const f = dIn.files[0]; if (f) readFile(f, t => { say(importDeals(t)); }); });
    root.append(field('Companies CSV', cIn), field('Deals CSV', dIn), msg);

    root.append(el('h2', {}, 'Weekly review settings'),
      el('div', { class: 'form-grid' },
        field('Nurture again after (days)', input(st.settings.nurtureDays, v => { st.settings.nurtureDays = Math.max(1, parseInt(v, 10) || 60); S.save(); }, { type: 'number', min: '1' }), 'Default 60, from "every couple of months".'),
        field('Deal is quiet after (days)', input(st.settings.quietDays, v => { st.settings.quietDays = Math.max(1, parseInt(v, 10) || 14); S.save(); }, { type: 'number', min: '1' }), 'A default I chose. Change it to fit your sales cycle.')));

    root.append(el('h2', {}, 'Erase everything'),
      el('p', { class: 'muted' }, 'Removes all companies, deals, events, saved answers and edited templates from this browser. Export a backup first.'),
      el('p', {}, btn('Erase all my entries', () => {
        if (window.confirm('Erase all entries in this browser? This cannot be undone.')) { S.reset(); S.redraw(); }
      }, 'danger')));
    return root;
  }
  window.TWPages.settings = settingsPage;
  window.TWPages.settings.section = 'settings';
})();
