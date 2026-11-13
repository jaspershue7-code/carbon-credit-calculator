// One-click changes used by the This week and Calendar pages. Each one saves and redraws.
(function () {
  const K = window.TWKit, S = window.TWStore;
  const today = () => K.today();
  const done = () => { S.save(); S.redraw(); };

  // Move a date field forward. An overdue date moves from today, a future one from itself.
  function snooze(obj, key, days) {
    const base = !obj[key] || obj[key] < today() ? today() : obj[key];
    obj[key] = K.addDays(base, days);
    done();
  }

  const A = {
    snooze,

    // Log a touch on a company and schedule the next one.
    logTouch(c, opts = {}) {
      S.logTouch(c, { date: today(), channel: opts.channel || c.channel || 'Other', note: opts.note || '' });
      c.nextTouch = K.addDays(today(), S.state().settings.nurtureDays);
      done();
    },
    notAFit(c) { c.status = 'Not a fit'; c.nextTouch = ''; done(); },

    // A deal's next step is finished. Record it and clear it so a new one can be set.
    stepDone(d) {
      d.log.push({ date: today(), text: 'Done: ' + (d.nextStep || 'next step') });
      d.lastTouch = today(); d.nextStep = ''; d.nextStepDate = '';
      done();
    },
    touchedBase(d) {
      d.log.push({ date: today(), text: 'Touched base' });
      d.lastTouch = today();
      done();
    },
    setNextStep(d, text, date) {
      d.nextStep = text.trim(); d.nextStepDate = date || '';
      done();
    },

    // Calls and meetings
    callDone(call, logTouch) {
      call.done = true;
      const c = S.findCompany(call.companyId);
      if (logTouch && c) S.logTouch(c, { date: call.date || today(), channel: 'Call', note: call.title });
      done();
    },
  };
  window.TWActions = A;
})();
