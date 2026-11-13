// Shared helpers used by every page. Loaded first.
(function () {
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
  // Compact numbers for chart labels so neighbouring bars do not collide.
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmt(n);

  // Small element helper. Text always goes in as text, never as HTML.
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  }

  const btn = (text, onclick, cls = '') => el('button', { type: 'button', class: 'btn ' + cls, onclick }, text);
  const field = (label, control, hint) =>
    el('label', { class: 'field' }, el('span', {}, label), control, hint ? el('small', { class: 'muted' }, hint) : null);
  // Inputs save on "change" (when the person leaves the field), so typing never loses focus.
  function input(value, onchange, attrs = {}) {
    const i = el('input', Object.assign({ type: 'text' }, attrs));
    i.value = value == null ? '' : value;
    i.addEventListener('change', () => onchange(i.value));
    return i;
  }
  function textarea(value, onchange, attrs = {}) {
    const t = el('textarea', Object.assign({ rows: 3 }, attrs));
    t.value = value || '';
    t.addEventListener('change', () => onchange(t.value));
    return t;
  }
  function select(options, value, onchange, attrs = {}) {
    const s = el('select', attrs);
    options.forEach(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; s.append(el('option', { value: v }, l)); });
    s.value = value;
    s.addEventListener('change', () => onchange(s.value));
    return s;
  }

  // Dates are kept as local YYYY-MM-DD text.
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s || today()); d.setDate(d.getDate() + n); return ymd(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);   // b minus a
  const daysSince = s => (s ? daysBetween(s, today()) : null);

  window.TWKit = { fmt, pct, short, el, btn, field, input, textarea, select, today, addDays, daysBetween, daysSince, parseDate: parse, refresh: () => {} };
})();
