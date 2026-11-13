// Small chart helpers in a data-journalism style: direct labels, thin baseline, no legends inside the plot.
(function () {
  const K = window.TWKit, { el, short } = K;
  const NS = 'http://www.w3.org/2000/svg';
  function node(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  }
  const yearsOf = (...objs) => {
    const ys = objs.flatMap(o => Object.keys(o).filter(y => /^\d{4}$/.test(y)).map(Number));
    if (!ys.length) return [];
    const out = []; for (let y = Math.min(...ys); y <= Math.max(...ys); y++) out.push(y);
    return out;
  };

  // One series of bars with the value written above each bar.
  function barChart(byYear, opts = {}) {
    const years = yearsOf(byYear);
    if (!years.length) return null;
    const { highlight = () => false, label = short, aria = 'Bar chart' } = opts;
    const W = 720, H = 210, padT = 26, padB = 28, step = W / years.length, bw = Math.min(52, step * 0.7);
    const max = Math.max(...years.map(y => byYear[y] || 0));
    const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': aria });
    svg.append(node('line', { x1: 0, x2: W, y1: H - padB, y2: H - padB, class: 'axis' }));
    years.forEach((y, i) => {
      const v = byYear[y] || 0;
      const h = max ? Math.max(v ? 2 : 0, (v / max) * (H - padT - padB)) : 0;
      const x = i * step + (step - bw) / 2;
      svg.append(node('rect', { x, y: H - padB - h, width: bw, height: h, class: highlight(y) ? 'hl' : '' }));
      if (v) svg.append(node('text', { x: x + bw / 2, y: H - padB - h - 6, 'text-anchor': 'middle', class: 'val' }, label(v)));
      if (years.length <= 12 || (years.length - 1 - i) % 2 === 0) svg.append(node('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, y));
    });
    return svg;
  }

  // Two series stacked per year: `base` underneath, `top` (the highlighted one) above it.
  function stackedBars(base, top, opts = {}) {
    const years = yearsOf(base, top);
    if (!years.length) return null;
    const { aria = 'Stacked bar chart' } = opts;
    const W = 720, H = 240, padT = 14, padB = 30, padL = 78, step = (W - padL) / years.length, bw = Math.min(30, step * 0.72);
    const total = y => (base[y] || 0) + (top[y] || 0);
    const max = Math.max(...years.map(total));
    const scale = v => (max ? (v / max) * (H - padT - padB) : 0);
    const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': aria });
    [0, 0.5, 1].forEach(f => {
      const y = H - padB - scale(max * f);
      svg.append(node('line', { x1: padL, x2: W, y1: y, y2: y, class: f === 0 ? 'axis' : 'grid' }));
      svg.append(node('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, f === 0 ? '0' : short(max * f)));
    });
    years.forEach((y, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const hb = scale(base[y] || 0), ht = scale(top[y] || 0);
      if (hb) svg.append(node('rect', { x, y: H - padB - hb, width: bw, height: hb, class: 'other' }));
      if (ht) svg.append(node('rect', { x, y: H - padB - hb - ht, width: bw, height: ht, class: 'hl' }));
      if (years.length <= 14 || (years.length - 1 - i) % 2 === 0) svg.append(node('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, y));
    });
    return svg;
  }

  // Horizontal bars as plain HTML so the names wrap and stay readable on a phone.
  // rows: [{ name, value, valueText, sub, highlight }]
  function hbars(rows) {
    const max = Math.max(...rows.map(r => r.value), 1);
    return el('div', { class: 'hbars' }, rows.map(r => el('div', { class: 'hbar-row' + (r.highlight ? ' hl' : '') },
      el('div', { class: 'hb-name' }, r.name, r.sub ? el('span', { class: 'muted' }, ' ' + r.sub) : null),
      el('div', { class: 'hb-track' }, el('div', { class: 'hb-fill', style: `width:${Math.max(0.5, (r.value / max) * 100)}%` })),
      el('div', { class: 'hb-val' }, r.valueText))));
  }

  // A figure with a numbered caption and a source line, like a data-journalism piece.
  function figure(number, caption, chart, source, legend) {
    return el('figure', { class: 'figure' },
      el('figcaption', {}, el('b', {}, `Figure ${number}. `), caption),
      legend || null, chart,
      source ? el('p', { class: 'source' }, source) : null);
  }
  const legend = items => el('p', { class: 'legend' }, items.map(([cls, text]) => el('span', {}, el('i', { class: cls }), text)));

  window.TWCharts = { barChart, stackedBars, hbars, figure, legend };
})();
