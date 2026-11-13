// Content tools: LinkedIn post ideas, monthly newsletter draft, email templates, due diligence answers.
(function () {
  const K = window.TWKit, S = window.TWStore;
  const { el, fmt, pct, btn, field, input, textarea, select } = K;
  const go = hash => { location.hash = hash; };

  function copy(text, button) {
    const done = () => { const old = button.textContent; button.textContent = 'Copied'; setTimeout(() => { button.textContent = old; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() {
      const t = el('textarea', {}); t.value = text; document.body.append(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { button.textContent = 'Press Ctrl+C'; }
      t.remove();
    }
  }

  const monthLabel = ym => `${S.monthName(Number(ym.slice(5, 7)))} ${ym.slice(0, 4)}`;

  /* ---------- LinkedIn post ideas ---------- */
  function postIdeas() {
    const P = window.TW_PORTFOLIO, D = window.TW_DATA, ideas = [];
    if (P) {
      const t = P.totals, src = `Berkeley Carbon Trading Project, Voluntary Registry Offsets Database ${P.version}, through ${P.throughDate}.`;
      ideas.push({
        title: 'Portfolio scale', check: ['Issued does not mean sold.', 'Retired includes California compliance retirements.'],
        draft: `${t.projects} Tradewater projects have now issued ${fmt(t.issued)} carbon credits. ${fmt(t.retired)} of them (${pct(t.retired, t.issued)}) have been retired.\n\n[One sentence on what these projects do.]\n\nSource: ${src}`,
      });
      const types = P.byType.map(g => `- ${g.name}: ${g.projects} projects, ${fmt(g.issued)} credits issued`).join('\n');
      ideas.push({
        title: 'Portfolio by project type', check: ['Type names are Berkeley\'s labels.'],
        draft: `Where Tradewater credits come from:\n\n${types}\n\n[Pick one type and say what makes it different.]\n\nSource: ${src}`,
      });
      const wells = P.byType.find(g => /well/i.test(g.name));
      if (wells) ideas.push({
        title: 'Well plugging spotlight', check: ['Confirm the project details with the project team before posting.'],
        draft: `${wells.projects} Tradewater projects plug oil and gas wells. Together they have issued ${fmt(wells.issued)} credits.\n\n[What happens at a well site, in two sentences.]\n\nSource: ${src}`,
      });
      const newest = P.projects.filter(p => p.listed).sort((a, z) => z.listed.localeCompare(a.listed)).slice(0, 3);
      if (newest.length) ideas.push({
        title: 'Newly listed projects', check: ['Listed means listed on the registry, not that credits are issued.'],
        draft: `New on the registries:\n\n${newest.map(p => `- ${p.name} (${p.id}), listed ${p.listed}`).join('\n')}\n\n[What these projects add.]\n\nSource: ${src}`,
      });
      const lastFull = String(new Date().getFullYear() - 1);
      if (P.retiredByYear[lastFull]) ideas.push({
        title: `Credits retired in ${lastFull}`, check: ['Some years include compliance retirements recorded in a single year.', 'Berkeley and CarbonPlan date some retirements differently.'],
        draft: `In ${lastFull}, ${fmt(P.retiredByYear[lastFull])} credits from Tradewater projects were retired.\n\n[What this says about demand, in your words.]\n\nSource: ${src}`,
      });
    }
    if (D) {
      const named = D.buyers.filter(b => b.kind === 'buyer' || b.kind === 'account').length;
      ideas.push({
        title: 'Organizations retiring Tradewater credits', check: ['Ask before naming any customer in a post.', 'Some names are accounts that retire credits for others.'],
        draft: `${named} organizations are named in registry records as retiring credits from Tradewater projects.\n\n[A theme across them, without naming anyone who has not agreed.]\n\nSource: CarbonPlan OffsetsDB, to ${D.generatedAt.slice(0, 10)}.`,
      });
    }
    return ideas;
  }

  const PROMPTS = [
    'A question a buyer asked in due diligence, and how you answered (remove names).',
    'What changed in the carbon credit market this month, and what it means for buyers.',
    'One project explained step by step: what goes in, what is verified, what is issued.',
    'A lesson from a conference or a lost deal.',
  ];
  const BEFORE_POSTING = [
    'Every number has a source line.',
    'No customer is named without their permission.',
    'The post makes one point.',
    'The first line makes sense on its own.',
    'It ends with a question or a clear next step.',
  ];

  function postsTab() {
    const root = el('div');
    root.append(el('p', { class: 'muted' }, 'First drafts built from the data. Every number comes from the registry data on this site. Edit freely, and replace the [brackets] with your own words.'));
    const ideas = postIdeas();
    if (!ideas.length) root.append(el('p', { class: 'empty' }, 'No data is loaded, so no drafts can be made.'));
    ideas.forEach(i => {
      const ta = el('textarea', { rows: 8, 'aria-label': i.title });
      ta.value = i.draft;
      root.append(el('div', { class: 'card' }, el('h3', {}, i.title), ta,
        el('ul', { class: 'plain muted' }, i.check.map(c => el('li', {}, 'Check: ' + c))),
        el('p', {}, btn('Copy', function () { copy(ta.value, this); }, 'small'))));
    });
    root.append(el('h2', {}, 'Topics that need your voice'), el('ul', { class: 'plain' }, PROMPTS.map(p => el('li', {}, p))));
    root.append(el('h2', {}, 'Before you post'), el('ul', { class: 'plain' }, BEFORE_POSTING.map(p => el('li', {}, p))));
    return root;
  }

  /* ---------- monthly newsletter ---------- */
  function newsletterDraft(ym) {
    const D = window.TW_DATA, P = window.TW_PORTFOLIO;
    const label = monthLabel(ym);
    const rows = [];
    D.buyers.forEach(b => b.tx.forEach(t => { if (t[0] && t[0].startsWith(ym)) rows.push({ b, qty: t[1] }); }));
    const sum = list => list.reduce((s, r) => s + r.qty, 0);
    const group = list => {
      const g = {};
      list.forEach(r => { g[r.b.name] = (g[r.b.name] || 0) + r.qty; });
      return Object.entries(g).sort((a, z) => z[1] - a[1]);
    };
    const out = [`Tradewater credits: ${label} update`, ''];
    out.push('Retirements');
    if (!rows.length) out.push(`No retirements from Tradewater projects are recorded for ${label} in the data (registry data to ${D.generatedAt.slice(0, 10)}).`);
    else {
      const unnamed = rows.filter(r => r.b.kind === 'none' || r.b.kind === 'tradewater');
      out.push(`${rows.length} retirements totaling ${fmt(sum(rows))} credits were recorded from Tradewater projects in ${label}.` +
        (unnamed.length ? ` ${fmt(sum(unnamed))} of those have no buyer named in the registry.` : ''));
      const partners = group(rows.filter(r => r.b.kind === 'intermediary'));
      if (partners.length) out.push('', 'Through partners and marketplaces:', ...partners.map(([n, q]) => `- ${n}: ${fmt(q)} credits`));
      const named = group(rows.filter(r => r.b.kind === 'buyer' || r.b.kind === 'account'));
      if (named.length) out.push('', 'Named in registry records (check permission before naming anyone):', ...named.map(([n, q]) => `- ${n}: ${fmt(q)} credits`));
    }
    if (P) {
      const t = P.totals;
      out.push('', 'Portfolio', `${t.projects} projects: ${fmt(t.issued)} credits issued, ${fmt(t.retired)} retired (Berkeley data, through ${P.throughDate}).`);
      const added = P.projects.filter(p => p.listed && p.listed.startsWith(ym));
      out.push(added.length ? `Listed in ${label}: ${added.map(p => `${p.name} (${p.id})`).join(', ')}.` : `No Tradewater projects were listed on the registries in ${label}.`);
    }
    out.push('', '[Add: a project update, an upcoming event, and a question for partners.]');
    return out.join('\n');
  }

  function newsletterTab() {
    const D = window.TW_DATA;
    const root = el('div');
    if (!D) return el('p', { class: 'empty' }, 'No data is loaded.');
    const months = [...new Set(D.buyers.flatMap(b => b.tx.map(t => t[0]).filter(Boolean).map(d => d.slice(0, 7))))].sort().reverse();
    const latest = months[0];
    root.append(el('p', { class: 'muted' }, `A draft for the monthly partner newsletter. Retirement data runs to ${D.generatedAt.slice(0, 10)}, so later months will be empty until the data is refreshed.`));
    const sel = select(months.map(m => [m, monthLabel(m)]), latest, () => {}, { 'aria-label': 'Month' });
    const ta = el('textarea', { rows: 18, 'aria-label': 'Newsletter draft' });
    const draw = () => { ta.value = newsletterDraft(sel.value); };
    sel.addEventListener('change', draw);
    draw();
    root.append(el('div', { class: 'controls' }, el('label', {}, 'Month', sel)), ta,
      el('p', {}, btn('Copy', function () { copy(ta.value, this); }, 'small')));
    return root;
  }

  /* ---------- email and message templates ---------- */
  const DEFAULT_TEMPLATES = [
    { id: 'cold-email', name: 'Cold email for a first meeting', subject: 'Carbon credits for {{company}}',
      body: 'Hi {{contact}},\n\n{{company_signal}}\n\n[One sentence on what Tradewater credits are and why they fit {{company}}.]\n\nWould a 20 minute call in the next two weeks work?\n\nBest,\n{{my_name}}' },
    { id: 'linkedin', name: 'LinkedIn message', subject: '',
      body: 'Hi {{contact}}, {{company_signal}} I work on carbon credit sales at Tradewater. Open to a short call to compare notes?' },
    { id: 'warm-intro', name: 'Ask for a warm introduction', subject: 'Intro to {{contact}} at {{company}}?',
      body: 'Hi [mutual connection],\n\nI am trying to reach {{contact}} at {{company}} about carbon credits, and I see you are connected. Would you be comfortable introducing us?\n\nHere is a short note you can forward:\n[Two lines on who you are and why {{company}} would care.]\n\nThank you,\n{{my_name}}' },
    { id: 'follow-up', name: 'Follow-up after a call', subject: 'Follow-up: {{deal}}',
      body: 'Hi {{contact}},\n\nThanks for the call. What I heard: [their goal and timing].\n\nWhat we agreed: [next steps and dates].\n\nWhat I will send: [documents or answers] by [date].\n\nBest,\n{{my_name}}' },
    { id: 'nudge', name: 'Nudge after silence', subject: 'Re: {{deal}}',
      body: 'Hi {{contact}},\n\nI wanted to check whether {{deal}} is still a priority for {{company}}. If the timing changed, tell me and I will pick this up when it suits you.\n\nIf you need something from me to move forward, such as [due diligence answers, a proposal, a call with the team], I can send it this week.\n\nBest,\n{{my_name}}' },
    { id: 'pre-event', name: 'Before an event', subject: 'Meet at {{event}}?',
      body: 'Hi {{contact}},\n\nI will be at {{event}} on {{event_date}}. Are you going? I would like 15 minutes to talk about {{company}}\'s carbon credit plans. [Suggest a time or place.]\n\nBest,\n{{my_name}}' },
    { id: 'post-event', name: 'After an event', subject: 'Good to meet at {{event}}',
      body: 'Hi {{contact}},\n\nGood to talk at {{event}}. You mentioned [what they said]. As promised, [what you are sending].\n\nCan we find 20 minutes next week to [next step]?\n\nBest,\n{{my_name}}' },
    { id: 'proposal', name: 'Proposal outline', subject: 'Proposal for {{company}}',
      body: 'Proposal for {{company}}\n\n1. What you asked for: [credits, project types, vintages, timing]\n2. What we propose: [projects, quantity, delivery]\n3. Pricing and terms: [price per credit, payment terms]\n4. Verification and registry details: [registry, protocol, serial numbers]\n5. Timeline: [key dates]\n6. Next steps: [who does what, by when]' },
  ];

  function templatesTab(rest) {
    const st = S.state();
    const getTemplates = () => st.templates || DEFAULT_TEMPLATES;
    const custom = () => { if (!st.templates) st.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)); return st.templates; };
    const preDeal = rest[0] === 'deal' ? S.findDeal(rest[1]) : null;

    const root = el('div');
    root.append(el('p', { class: 'muted' }, 'Pick a template and a company, deal or event. Known details are filled in. Anything in [brackets] is for you to write.'));

    const tplSel = select(getTemplates().map(t => [t.id, t.name]), preDeal ? 'follow-up' : getTemplates()[0].id, () => {}, { 'aria-label': 'Template' });
    const compSel = select([['', 'No company'], ...st.companies.map(c => [c.id, c.name])], preDeal ? preDeal.companyId : '', () => {}, { 'aria-label': 'Company' });
    const dealSel = select([['', 'No deal'], ...st.deals.map(d => [d.id, d.name || 'Untitled deal'])], preDeal ? preDeal.id : '', () => {}, { 'aria-label': 'Deal' });
    const evSel = select([['', 'No event'], ...st.events.map(e => [e.id, e.name])], '', () => {}, { 'aria-label': 'Event' });
    const contactIn = el('input', { type: 'text', placeholder: 'Contact name', 'aria-label': 'Contact name' });
    const meIn = el('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', value: st.settings.myName || '' });
    meIn.addEventListener('change', () => { st.settings.myName = meIn.value; S.save(); draw(); });
    const subjOut = el('input', { type: 'text', readonly: true, 'aria-label': 'Subject' });
    const bodyOut = el('textarea', { rows: 14, 'aria-label': 'Message' });
    const subjEdit = el('input', { type: 'text', 'aria-label': 'Edit subject' });
    const bodyEdit = el('textarea', { rows: 10, 'aria-label': 'Edit template' });

    function values() {
      let c = S.findCompany(compSel.value);
      const d = S.findDeal(dealSel.value);
      if (!c && d) c = S.findCompany(d.companyId);
      const e = S.findEvent(evSel.value);
      const entry = c ? S.dataEntry(c.ref) : null;
      const v = {
        company: c ? c.name : d && d.companyName ? d.companyName : '',
        contact: contactIn.value.trim() || (c && c.people[0] && c.people[0].name) || '',
        deal: d ? d.name : '', credits: d && d.credits ? fmt(Number(d.credits) || 0) : '',
        event: e ? e.name : '', event_date: e ? e.date : '', my_name: meIn.value.trim(),
        retired_credits: entry ? fmt(entry.total) : '', last_retirement: entry ? entry.last : '',
      };
      v.company_signal = entry && v.company
        ? `I saw that ${v.company} retired ${v.retired_credits} carbon credits from Tradewater projects, most recently on ${v.last_retirement}.`
        : `[Something specific you noticed about ${v.company || 'their company'}.]`;
      return v;
    }
    const fill = (text, v) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] ? v[k] : `[${k.replace(/_/g, ' ')}]`));

    function draw() {
      const t = getTemplates().find(x => x.id === tplSel.value) || getTemplates()[0];
      const v = values();
      subjOut.value = fill(t.subject, v);
      bodyOut.value = fill(t.body, v);
      subjEdit.value = t.subject; bodyEdit.value = t.body;
    }
    [tplSel, compSel, dealSel, evSel].forEach(s => s.addEventListener('change', () => {
      if (s === compSel && compSel.value) { const c = S.findCompany(compSel.value); contactIn.value = (c && c.people[0] && c.people[0].name) || ''; }
      draw();
    }));
    contactIn.addEventListener('input', draw);
    if (preDeal) { const c = S.findCompany(preDeal.companyId); contactIn.value = (c && c.people[0] && c.people[0].name) || ''; }

    root.append(el('div', { class: 'controls' },
      el('label', {}, 'Template', tplSel), el('label', {}, 'Company', compSel), el('label', {}, 'Deal', dealSel), el('label', {}, 'Event', evSel),
      el('label', {}, 'Contact', contactIn), el('label', {}, 'Your name', meIn)));
    root.append(field('Subject', subjOut), field('Message', bodyOut),
      el('p', {}, btn('Copy message', function () { copy((subjOut.value ? subjOut.value + '\n\n' : '') + bodyOut.value, this); }, 'small')));

    root.append(el('h2', {}, 'Edit this template'),
      el('p', { class: 'muted' }, 'Placeholders: {{company}} {{contact}} {{deal}} {{credits}} {{event}} {{event_date}} {{my_name}} {{retired_credits}} {{last_retirement}} {{company_signal}}'),
      field('Subject line', subjEdit), field('Template text', bodyEdit),
      el('p', {}, btn('Save template', () => {
        const t = custom().find(x => x.id === tplSel.value);
        t.subject = subjEdit.value; t.body = bodyEdit.value; S.save(); draw();
      }, 'small'), ' ', btn('Reset all templates', () => {
        if (window.confirm('Reset every template to the original text?')) { st.templates = null; S.save(); S.redraw(); }
      }, 'small')));
    draw();
    return root;
  }

  /* ---------- due diligence answers ---------- */
  function libraryTab() {
    const st = S.state();
    const root = el('div');
    root.append(el('p', { class: 'muted' }, 'Questions buyers ask during due diligence, with your approved answers, so you can reuse them. Nothing is pre-filled: add what you actually use.'));
    const q = el('input', { type: 'text', placeholder: 'Question', 'aria-label': 'Question' });
    const a = el('textarea', { rows: 3, placeholder: 'Answer', 'aria-label': 'Answer' });
    root.append(el('div', { class: 'form-grid' }, field('Question', q), field('Answer', a)),
      el('p', {}, btn('Add', () => {
        if (!q.value.trim()) { q.focus(); return; }
        st.qa.push({ id: S.uid(), q: q.value.trim(), a: a.value.trim() }); S.save(); S.redraw();
      }, 'primary')));
    if (!st.qa.length) { root.append(el('p', { class: 'empty' }, 'No answers saved yet.')); return root; }
    const search = el('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search' });
    const host = el('div');
    const draw = () => {
      const s = search.value.trim().toLowerCase();
      host.replaceChildren();
      st.qa.filter(x => !s || (x.q + ' ' + x.a).toLowerCase().includes(s)).forEach(x => host.append(el('div', { class: 'card' },
        field('Question', input(x.q, v => { x.q = v; S.save(); })),
        field('Answer', textarea(x.a, v => { x.a = v; S.save(); }, { rows: 4 })),
        el('p', {}, btn('Copy answer', function () { copy(x.a, this); }, 'small'), ' ',
          btn('Delete', () => { st.qa.splice(st.qa.indexOf(x), 1); S.save(); S.redraw(); }, 'small')))));
    };
    search.addEventListener('input', draw);
    root.append(el('div', { class: 'controls' }, el('label', {}, 'Search', search)), host);
    draw();
    return root;
  }

  const TABS = [['posts', 'LinkedIn posts'], ['newsletter', 'Newsletter'], ['templates', 'Email templates'], ['library', 'Due diligence answers']];
  function contentPage(arg) {
    const parts = (arg || '').split('/');
    const tab = TABS.some(t => t[0] === parts[0]) ? parts[0] : 'posts';
    document.title = 'Content | Tradewater Sales Tool';
    const root = el('div');
    root.append(el('h1', {}, 'Content'),
      el('p', { class: 'lede' }, 'Drafts for posts, the monthly newsletter, emails and proposals, and a library of due diligence answers.'),
      el('nav', { class: 'subnav', 'aria-label': 'Content tools' }, TABS.map(([k, label]) =>
        el('a', { href: '#/content/' + k, 'aria-current': k === tab ? 'page' : null }, label))));
    root.append(tab === 'posts' ? postsTab() : tab === 'newsletter' ? newsletterTab() : tab === 'templates' ? templatesTab(parts.slice(1)) : libraryTab());
    return root;
  }
  window.TWPages.content = contentPage;
  window.TWPages.content.section = 'content';
})();
