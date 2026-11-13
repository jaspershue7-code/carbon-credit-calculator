// Lead ranking. A score is a weighted sum of readable signals, each between 0 and 1, so every score can be explained.
// This is a ranking of fit, not a prediction that anyone will buy.
(function () {
  const K = window.TWKit, S = window.TWStore;
  const { fmt } = K;

  const SIGNALS = ['volume', 'recency', 'repeat', 'typeFit', 'vintage', 'timing'];
  const LABELS = { volume: 'Size', recency: 'Recent activity', repeat: 'Repeat buying', typeFit: 'Credit type fit', vintage: 'Vintage fit', timing: 'Timing' };
  const HELP = {
    volume: 'How many credits they retired compared with the others in the same list.',
    recency: 'How recently they retired credits, measured against the data snapshot date.',
    repeat: 'How many different years they retired credits in.',
    typeFit: 'Whether they mostly retire the credit types where Tradewater has a large share of the market.',
    vintage: 'Whether they retire vintages (reduction years) that Tradewater still has credits remaining in.',
    timing: 'Whether their usual retirement month is this month or next. Needs retirements in at least 2 years.',
  };
  // Defaults a person can change. They add up to 100 but do not have to.
  const DEFAULT_WEIGHTS = {
    new: { volume: 20, recency: 25, repeat: 15, typeFit: 25, vintage: 10, timing: 5 },
    repeat: { volume: 15, recency: 30, repeat: 25, typeFit: 5, vintage: 10, timing: 15 },
  };
  // Registry types in the CarbonPlan data mapped to Berkeley's names, so market shares can be looked up.
  const TYPE_MAP = { 'Ozone Depleting Substances': 'Ozone Depleting Substances Recovery & Destruction', 'HFC Reclamation': 'HFC Refrigerant Reclamation', 'Oil + Gas Well': 'Plugging Oil & Gas Wells' };
  const MIN_REMAINING = 100000;   // a vintage counts as "in stock" when Tradewater has at least this many credits left in it
  const HIGH = 0.6;               // a signal counts as strong at or above this value

  const weights = list => Object.assign({}, DEFAULT_WEIGHTS[list], (S.state().settings.scoreWeights || {})[list] || {});

  function context() {
    const D = window.TW_DATA, P = window.TW_PORTFOLIO;
    const snap = D.generatedAt.slice(0, 10);
    const shares = {};
    if (P && P.market) P.market.types.forEach(t => { shares[t.name] = t.all.issued ? t.tradewater.issued / t.all.issued : 0; });
    const stock = {};
    if (P) Object.entries(P.remainingByVintage).forEach(([y, v]) => { if (v >= MIN_REMAINING) stock[y] = v; });
    // Developers of the same project types are competitors, so they are not ranked as buyers.
    const devKeys = new Set(((P && P.market && P.market.developerNames) || []).map(S.nameKey));
    return { D, P, snap, shares, stock, devKeys, maxShare: Math.max(0, ...Object.values(shares)) };
  }

  // Each signal returns { value: 0..1, short, text }.
  function signal(key, e, pool, cx) {
    if (key === 'volume') {
      const others = pool.filter(x => x !== e);
      const smaller = others.filter(x => x.total < e.total).length;
      const pct = others.length ? smaller / others.length : 0;
      return { value: pct, short: `retired ${fmt(e.total)} credits (more than ${Math.round(pct * 100)}% of the list)`, text: `Retired ${fmt(e.total)} credits, more than ${Math.round(pct * 100)}% of the others in this list.` };
    }
    if (key === 'recency') {
      if (!e.last) return { value: 0, short: 'no retirement date', text: 'No retirement date recorded.' };
      const days = K.daysBetween(e.last, cx.snap);
      const value = days <= 90 ? 1 : days <= 365 ? 0.6 : days <= 730 ? 0.25 : 0;
      return { value, short: `last retired ${days} days before the snapshot`, text: `Last retired ${e.last}, ${days} days before the data snapshot (${cx.snap}). Within 90 days scores 1, within a year 0.6, within two years 0.25.` };
    }
    if (key === 'repeat') {
      const y = e.yearsActive;
      const value = y >= 3 ? 1 : y === 2 ? 0.6 : y === 1 ? 0.2 : 0;
      return { value, short: `retired in ${y} year${y === 1 ? '' : 's'}`, text: `Retired credits in ${y} different year${y === 1 ? '' : 's'}. Three or more scores 1, two 0.6, one 0.2.` };
    }
    if (key === 'typeFit') {
      let tot = 0, weighted = 0, top = null;
      Object.entries(e.byType).forEach(([t, q]) => {
        const share = cx.shares[TYPE_MAP[t]] || 0;
        tot += q; weighted += q * share;
        if (!top || q > top.q) top = { t, q, share };
      });
      if (!tot || !cx.maxShare) return { value: 0, short: 'no type data', text: 'No credit type data.' };
      const value = (weighted / tot) / cx.maxShare;
      return { value, short: `mostly ${top.t.toLowerCase()} (Tradewater issues ${(top.share * 100).toFixed(1)}% of it)`, text: `Mostly ${top.t} credits, where Tradewater has ${(top.share * 100).toFixed(1)}% of the credits issued. Scored against Tradewater's best share (${(cx.maxShare * 100).toFixed(1)}%).` };
    }
    if (key === 'vintage') {
      const years = Object.keys(cx.stock);
      if (!years.length) return { value: 0, short: 'no portfolio data', text: 'No portfolio data to compare vintages.' };
      let tot = 0, hit = 0; const seen = {};
      e.tx.forEach(t => { tot += t[1]; if (cx.stock[t[3]]) { hit += t[1]; seen[t[3]] = true; } });
      const value = tot ? hit / tot : 0;
      const list = Object.keys(seen).sort();
      return { value, short: list.length ? `retires vintages ${list.join(', ')}, which Tradewater has in stock` : 'retires older vintages', text: `${Math.round(value * 100)}% of their listed retirements are in vintages where Tradewater has at least ${fmt(MIN_REMAINING)} credits remaining (${years.sort().join(', ')}).` };
    }
    // timing
    const um = S.usualMonths(e);
    if (!um) return { value: 0, short: 'no usual month yet', text: 'No usual month: it needs retirements in at least 2 different years.' };
    const month = new Date().getMonth() + 1, ahead = (um.month - month + 12) % 12;
    const value = ahead <= 1 ? 1 : ahead <= 3 ? 0.5 : 0;
    return { value, short: `usually retires in ${S.monthName(um.month)}`, text: `Usually retires in ${S.monthName(um.month)} (${um.years} of ${um.ofYears} years). This month or next scores 1, within three months 0.5.` };
  }

  function scoreEntry(list, e, pool, cx, w) {
    const total = SIGNALS.reduce((s, k) => s + (w[k] || 0), 0);
    const signals = SIGNALS.map(k => {
      const r = signal(k, e, pool, cx);
      return Object.assign({ key: k, label: LABELS[k], weight: w[k] || 0 }, r, { points: total ? (w[k] || 0) * r.value / total * 100 : 0 });
    });
    return { e, list, signals, score: Math.round(signals.reduce((s, x) => s + x.points, 0)) };
  }

  // list is "new" (competitor buyers) or "repeat" (Tradewater's past buyers). Marketplaces and traders are left out.
  const named = x => x.kind === 'buyer' || x.kind === 'account';
  const eligible = (list, cx) => (list === 'new' ? cx.D.leads : cx.D.buyers).filter(x => named(x) && !cx.devKeys.has(S.nameKey(x.name)));
  // Named entries that were left out because they develop similar projects themselves.
  function leftOut(list) {
    const cx = context();
    if (!cx.D) return [];
    return (list === 'new' ? cx.D.leads : cx.D.buyers).filter(x => named(x) && cx.devKeys.has(S.nameKey(x.name)));
  }
  function rank(list) {
    const cx = context();
    if (!cx.D) return [];
    const pool = eligible(list, cx);
    const w = weights(list);
    return pool.map(e => scoreEntry(list, e, pool, cx, w)).sort((a, z) => z.score - a.score || z.e.total - a.e.total)
      .map((r, i) => Object.assign(r, { rank: i + 1, inList: S.findCompanyByName(r.e.name) || null }));
  }
  // The strongest signals, as short phrases.
  const topReasons = (r, n = 3) => r.signals.filter(s => s.weight > 0 && s.value >= 0.5).sort((a, z) => z.points - a.points).slice(0, n).map(s => s.short);

  /* ---------- evidence from Eli's own results ---------- */
  // Wins are companies with a closed won deal. Losses have a closed lost deal or are marked Not a fit.
  // Only companies linked to a registry record can be read.
  function outcomes() {
    const st = S.state(), cx = context();
    const res = { wins: [], losses: [], unlinked: 0 };
    if (!cx.D) return res;
    st.companies.forEach(c => {
      const deals = st.deals.filter(d => d.companyId === c.id);
      const won = deals.some(d => d.stage === 'Closed won');
      const lost = deals.some(d => d.stage === 'Closed lost') || c.status === 'Not a fit';
      if (!won && !lost) return;
      const entry = S.dataEntry(c.ref);
      if (!entry) { res.unlinked += 1; return; }
      const list = c.ref.type === 'lead' ? 'new' : 'repeat';
      const pool = eligible(list, cx);
      const r = scoreEntry(list, entry, pool.includes(entry) ? pool : pool.concat([entry]), cx, weights(list));
      (won ? res.wins : res.losses).push({ c, r });
    });
    return res;
  }
  function evidence() {
    const o = outcomes(), n = o.wins.length + o.losses.length;
    const rows = SIGNALS.map(k => ({
      key: k, label: LABELS[k],
      wins: o.wins.filter(x => x.r.signals.find(s => s.key === k).value >= HIGH).length,
      losses: o.losses.filter(x => x.r.signals.find(s => s.key === k).value >= HIGH).length,
    }));
    return { wins: o.wins.length, losses: o.losses.length, total: n, unlinked: o.unlinked, enough: n >= 5, rows };
  }

  window.TWScore = { SIGNALS, LABELS, HELP, DEFAULT_WEIGHTS, HIGH, weights, rank, leftOut, topReasons, evidence, MIN_REMAINING };
})();
