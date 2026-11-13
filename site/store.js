// Eli's own entries, saved in this browser (localStorage). Nothing leaves the computer.
(function () {
  const KEY = 'tradewater-tool-v1';
  const K = () => window.TWKit;

  const COMPANY_TYPES = [['prospect', 'Target'], ['customer', 'Customer'], ['partner', 'Partner']];
  const PROSPECT_STATUS = ['New', 'Researching', 'Contacted', 'Meeting booked', 'Nurturing', 'Not a fit'];
  const ACCOUNT_STATUS = ['Active', 'Dormant'];
  // The outreach options and touch types come from Eli's description of the job.
  const CHANNELS = ['Warm intro', 'LinkedIn comment or reaction', 'LinkedIn message', 'Cold email', 'Conference or event', 'Call', 'Meeting', 'Other'];
  const DEAL_STAGES = ['Initial meeting', 'Due diligence', 'Proposal', 'Negotiation', 'Closed won', 'Closed lost'];
  const OPEN_STAGES = DEAL_STAGES.slice(0, 4);
  const OUTREACH_STATUS = ['Not started', 'Sent', 'Replied', 'Meeting set'];
  const ATTENDEE_KINDS = [['target', 'Target'], ['customer', 'Customer'], ['partner', 'Partner'], ['other', 'Other']];
  const DEFAULT_FOLLOWUPS = [
    'Do outreach in advance to targets, customers and partners who are going',
    'Choose the best panels and plan the schedule',
    'Follow up promptly afterwards',
  ];

  const empty = () => ({
    version: 1, companies: [], deals: [], events: [], calls: [], qa: [], templates: null,
    settings: { weeklyGoal: 0, nurtureDays: 60, quietDays: 14 }, lastExport: null,
  });

  let state = empty();
  let persistent = true;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); state = Object.assign(empty(), s, { settings: Object.assign(empty().settings, s.settings || {}) }); }
    } catch (e) { persistent = false; }
  }
  function save() {
    if (!persistent) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { persistent = false; }
  }
  load();

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Same name cleanup the data build uses, so "Aledade, Inc." matches "Aledade Inc".
  const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|pbc|the|company)\b/g;
  const nameKey = n => (n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();

  const api = {
    consts: { COMPANY_TYPES, PROSPECT_STATUS, ACCOUNT_STATUS, CHANNELS, DEAL_STAGES, OPEN_STAGES, OUTREACH_STATUS, ATTENDEE_KINDS, DEFAULT_FOLLOWUPS },
    state: () => state,
    isPersistent: () => persistent,
    save, uid, nameKey,
    replaceAll(obj) { state = Object.assign(empty(), obj, { settings: Object.assign(empty().settings, obj.settings || {}) }); save(); },
    reset() { state = empty(); save(); },

    findCompany: id => state.companies.find(c => c.id === id),
    findCompanyByName: name => { const k = nameKey(name); return k ? state.companies.find(c => nameKey(c.name) === k) : undefined; },
    findDeal: id => state.deals.find(d => d.id === id),
    findEvent: id => state.events.find(e => e.id === id),
    findCall: id => state.calls.find(c => c.id === id),

    addCompany(fields) {
      const existing = api.findCompanyByName(fields.name);
      if (existing) return existing;
      const c = Object.assign({
        id: uid(), name: '', type: 'prospect', status: 'New', channel: '', people: [], nextTouch: '', lastTouch: '',
        touches: [], notes: '', ref: null, createdAt: K().today(),
      }, fields);
      state.companies.push(c); save(); return c;
    },
    addDeal(fields) {
      const d = Object.assign({
        id: uid(), name: '', companyId: '', companyName: '', stage: 'Initial meeting', credits: '', terms: '',
        nextStep: '', nextStepDate: '', lastTouch: '', log: [], notes: '', createdAt: K().today(),
      }, fields);
      state.deals.push(d); save(); return d;
    },
    addEvent(fields) {
      const e = Object.assign({
        id: uid(), name: '', date: '', location: '', url: '', notes: '', attendees: [], panels: [],
        followUps: DEFAULT_FOLLOWUPS.map(text => ({ text, done: false })),
      }, fields);
      state.events.push(e); save(); return e;
    },
    addCall(fields) {
      const c = Object.assign({
        id: uid(), title: '', date: '', time: '', companyId: '', companyName: '', dealId: '', notes: '', remindDays: 1, done: false, createdAt: K().today(),
      }, fields);
      state.calls.push(c); save(); return c;
    },
    // A small "Remind me" dropdown for any record. Missing value means 1 day before.
    remindField(obj, key) {
      const s = K().select([['0', 'On the day'], ['1', '1 day before'], ['3', '3 days before'], ['7', '1 week before']], String(obj[key] == null ? 1 : obj[key]), v => { obj[key] = Number(v); save(); api.redraw(); });
      return s;
    },
    logTouch(company, entry) {
      company.touches.push(entry);
      const latest = company.touches.map(t => t.date).sort().pop();
      company.lastTouch = latest || company.lastTouch;
      save();
    },
    removeCompany(id) {
      state.companies = state.companies.filter(c => c.id !== id);
      state.deals.forEach(d => { if (d.companyId === id) d.companyId = ''; });
      state.calls.forEach(c => { if (c.companyId === id) c.companyId = ''; });
      save();
    },
    isOpenDeal: d => OPEN_STAGES.includes(d.stage),

    // Companies linked to the market data. type is "buyer" or "lead".
    dataEntry(ref) {
      const D = window.TW_DATA;
      if (!ref || !D) return null;
      return (ref.type === 'lead' ? D.leads : D.buyers).find(x => x.id === ref.id) || null;
    },
    // Months in which a linked company usually retires credits, from the registry dates.
    usualMonths(entry) {
      if (!entry) return null;
      const byMonth = {}, years = new Set();
      entry.tx.forEach(t => {
        if (!t[0]) return;
        const y = t[0].slice(0, 4), m = Number(t[0].slice(5, 7));
        years.add(y); (byMonth[m] = byMonth[m] || new Set()).add(y);
      });
      if (years.size < 2) return null;
      const top = Object.entries(byMonth).sort((a, z) => z[1].size - a[1].size)[0];
      return { month: Number(top[0]), years: top[1].size, ofYears: years.size };
    },
    monthName: m => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1],
    exportJSON() { state.lastExport = K().today(); save(); return JSON.stringify(state, null, 2); },
  };

  window.TWStore = api;
  window.TWPages = window.TWPages || {};
  // Pages call this after they change data that needs a redraw.
  api.redraw = () => K().refresh();
})();
