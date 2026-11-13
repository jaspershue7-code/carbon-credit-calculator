// Lead ranking page: who is worth a conversation, with the reasons, plus the evidence from Eli's own results.
(function () {
  const K = window.TWKit, S = window.TWStore, SC = () => window.TWScore;
  const { el, fmt, btn } = K;

  const ui = { hideListed: true, shown: { new: 15, repeat: 15 } };
  const PAGE = 15;

  function breakdown(r) {
    return el('details', {}, el('summary', {}, 'Why this score'),
      el('div', { class: 'scroll' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Signal'), el('th', { class: 'num' }, 'Weight'), el('th', { class: 'num' }, 'Value'), el('th', { class: 'num' }, 'Points'), el('th', {}, 'What was measured'))),
        el('tbody', {}, r.signals.map(s => el('tr', {},
          el('td', {}, s.label), el('td', { class: 'num' }, s.weight), el('td', { class: 'num' }, s.value.toFixed(2)),
          el('td', { class: 'num' }, s.points.toFixed(1)), el('td', { class: 'muted' }, s.text)))))));
  }

  function rowFor(r, list) {
    const e = r.e, type = list === 'new' ? 'prospect' : 'customer';
    const href = (list === 'new' ? '#/lead/' : '#/buyer/') + encodeURIComponent(e.id);
    const reasons = SC().topReasons(r);
    return el('div', { class: 'rowcard ranked' },
      el('div', { class: 'rowcard-head' },
        el('span', { class: 'score', title: 'Score out of 100' }, String(r.score)),
        el('span', { class: 'rankname' }, el('b', {}, `${r.rank}. `), el('a', { href }, e.name),
          r.inList ? el('span', { class: 'tag' }, r.inList.status === 'Not a fit' ? 'marked not a fit' : 'in your ' + (r.inList.type === 'prospect' ? 'targets' : 'accounts')) : null)),
      el('p', { class: 'muted reasons' }, reasons.length ? reasons.join('; ') + '.' : 'A weak match on every signal.'),
      breakdown(r),
      el('div', { class: 'row-actions' },
        r.inList
          ? el('a', { href: '#/company/' + r.inList.id }, 'Open company')
          : btn(list === 'new' ? 'Add as target' : 'Add as customer', () => {
            S.addCompany({ name: e.name, type, status: type === 'prospect' ? 'New' : 'Active', ref: { type: list === 'new' ? 'lead' : 'buyer', id: e.id } });
            K.refresh();
          }, 'small'),
        el('a', { href }, 'Full history')));
  }

  function listSection(list, title, hint) {
    const all = SC().rank(list);
    const rows = ui.hideListed ? all.filter(r => !r.inList) : all;
    const shown = rows.slice(0, ui.shown[list]);
    const sec = el('div', {}, el('h2', {}, title), el('p', { class: 'muted' }, hint));
    const out = SC().leftOut(list);
    if (out.length) sec.append(el('p', { class: 'muted small' }, 'Left out because they develop similar projects themselves, so they are more likely competitors: ' + out.map(x => x.name).join('; ') + '.'));
    if (!rows.length) { sec.append(el('p', { class: 'empty' }, all.length ? 'Everyone on this list is already in your targets or accounts.' : 'No data is loaded.')); return sec; }
    shown.forEach(r => sec.append(rowFor(r, list)));
    if (rows.length > shown.length) sec.append(el('p', {}, btn(`Show ${Math.min(PAGE, rows.length - shown.length)} more`, () => { ui.shown[list] += PAGE; K.refresh(); }, 'small'), el('span', { class: 'muted' }, ` ${shown.length} of ${rows.length} shown`)));
    return sec;
  }

  function evidencePanel() {
    const ev = SC().evidence();
    const sec = el('div', {}, el('h2', {}, 'What has worked so far'),
      el('p', { class: 'muted' }, 'Counted automatically from your closed won deals (wins) and your closed lost deals and "Not a fit" marks (losses), for companies linked to their registry record.'),
      el('ul', { class: 'facts' },
        el('li', {}, el('b', {}, ev.wins), el('span', {}, 'wins')),
        el('li', {}, el('b', {}, ev.losses), el('span', {}, 'losses')),
        el('li', {}, el('b', {}, ev.unlinked), el('span', {}, 'outcomes not linked to registry data'))));
    if (!ev.enough) {
      sec.append(el('p', {}, `Not enough outcomes yet: ${ev.total} of 5. Close deals as won or lost, or mark targets as not a fit, and link each company to its registry record (the "Add as target" buttons do this for you). The comparison appears once there are 5.`));
      return sec;
    }
    sec.append(el('div', { class: 'scroll' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Signal'), el('th', { class: 'num' }, `Wins where it was strong (of ${ev.wins})`), el('th', { class: 'num' }, `Losses where it was strong (of ${ev.losses})`))),
      el('tbody', {}, ev.rows.map(r => el('tr', {}, el('td', {}, r.label), el('td', { class: 'num' }, r.wins), el('td', { class: 'num' }, r.losses)))))),
      el('p', { class: 'muted' }, `A signal counts as strong at ${SC().HIGH} or above. With this few outcomes, treat gaps as hints, not proof. Weights never change on their own: use the sliders below if you want to act on what you see.`));
    return sec;
  }

  function weightsPanel() {
    const st = S.state();
    const sec = el('div', {}, el('h2', {}, 'Adjust the weights'),
      el('p', { class: 'muted' }, 'Weights decide how much each signal counts. They are shown as a share of the total, so only the proportions matter. Changes apply when you let go of the slider.'));
    [['new', 'New targets'], ['repeat', 'Repeat customers']].forEach(([list, title]) => {
      const w = SC().weights(list);
      sec.append(el('h3', {}, title));
      SC().SIGNALS.forEach(k => {
        const total = SC().SIGNALS.reduce((s, x) => s + (SC().weights(list)[x] || 0), 0);
        const out = el('span', { class: 'wval' }, `${w[k]} (${total ? Math.round(w[k] / total * 100) : 0}%)`);
        const slider = el('input', { type: 'range', min: '0', max: '40', step: '5', value: String(w[k]), 'aria-label': `${title}: ${SC().LABELS[k]} weight` });
        slider.addEventListener('input', () => { out.textContent = slider.value; });
        slider.addEventListener('change', () => {
          st.settings.scoreWeights = st.settings.scoreWeights || {};
          st.settings.scoreWeights[list] = Object.assign({}, SC().weights(list), { [k]: Number(slider.value) });
          S.save(); K.refresh();
        });
        sec.append(el('div', { class: 'weight-row' },
          el('div', {}, el('b', {}, SC().LABELS[k]), el('div', { class: 'muted small' }, SC().HELP[k])), slider, out));
      });
    });
    sec.append(el('p', {}, btn('Reset all weights', () => { delete st.settings.scoreWeights; S.save(); K.refresh(); }, 'small')));
    return sec;
  }

  function rankingPage() {
    document.title = 'Lead ranking | Tradewater sales tool';
    const D = window.TW_DATA;
    const root = el('div');
    root.append(el('h1', {}, 'Lead ranking'),
      el('p', { class: 'lede' }, 'Companies worth a conversation, ranked by how closely their past retirements match what Tradewater sells. Every score is a sum of reasons you can read and reweight.'),
      el('p', { class: 'note' }, `This is a ranking of fit, not a prediction that anyone will buy. It uses registry data, which names a company for only about a quarter of retired credits, so companies that hold credits, or retire through a marketplace, are not here. Recency is measured against the data snapshot (${D ? D.generatedAt.slice(0, 10) : 'unknown'}). Marketplaces and traders are left out.`));

    const cb = el('input', { type: 'checkbox', checked: ui.hideListed, 'aria-label': 'Hide companies already in my list' });
    cb.addEventListener('change', () => { ui.hideListed = cb.checked; K.refresh(); });
    root.append(el('p', {}, el('label', { class: 'check' }, cb, ' Hide companies already in my targets or accounts')));

    root.append(
      listSection('new', 'New targets', 'Named companies that retired the same credit types from other developers and have not retired Tradewater credits.'),
      listSection('repeat', 'Repeat customers', 'Named companies that already retired Tradewater credits, ranked by how a repeat purchase looks. A company may have bought through a partner.'),
      evidencePanel(), weightsPanel());
    return root;
  }
  window.TWPages.ranking = rankingPage;
  window.TWPages.ranking.section = 'ranking';
})();
