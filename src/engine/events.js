// World events (historical and random), city requests, promises and expo bids.
(function (G) {
  'use strict';
  const { CITY, CITIES, REGIONS, REGION } = G;

  // Called after the calendar advances: applies anything scheduled for the new quarter.
  G.tickEvents = function (s, rep) {
    const sc = s.scenario && G.SCENARIO[s.scenario];
    for (const h of [...G.HISTORY, ...((sc && sc.shocks) || [])]) {
      if (h.y !== s.year || h.q !== s.q) continue;
      if (h.kind === 'open') ['PEK', 'SHA', 'CAN'].forEach(c => (s.opened[c] = true));
      if (h.kind === 'coldwar') s.coldWarOver = true;
      if (['region', 'city', 'world', 'fuel'].includes(h.kind)) { s.events.push({ ...h, hist: true }); crisisFrom(s, h); }
      if (h.fuel) { s.events.push({ kind: 'fuel', mult: h.fuel, left: 3, text: `${h.text} Fuel prices jump.` }); crisisFrom(s, { kind: 'fuel', text: h.text }); }
      rep.world.push({ text: h.text, hist: true });
    }
    for (const [y, c] of G.OLYMPICS) {
      if (y === s.year + 1 && s.q === 0) {
        s.events.push({ kind: 'city', city: c, mult: 1.15, left: 4, text: `${CITY[c].name} prepares to host the Olympic Games.` });
        rep.world.push({ text: `${CITY[c].name} gears up for the ${y} Olympics. Demand there is rising.` });
      }
      if (y === s.year && s.q === 2) {
        s.events.push({ kind: 'city', city: c, mult: 1.7, left: 1, text: `The Olympic Games in ${CITY[c].name}.` });
        rep.world.push({ text: `The Olympic Games open in ${CITY[c].name}. Demand +70% this quarter.` });
      }
    }
    for (const b of s.expoBids.filter(b => b.year === s.year && s.q === 1)) {
      if (G.rnd(s) < 0.5) {
        s.events.push({ kind: 'city', city: b.city, mult: 1.5, left: 2, text: `World Expo in ${CITY[b.city].name}.` });
        G.addRel(s, 0, b.city, 10);
        rep.world.push({ text: `${CITY[b.city].name} won the World Expo you sponsored! Demand +50% for two quarters.`, good: true });
      } else rep.world.push({ text: `${CITY[b.city].name}'s Expo bid failed. The city still appreciates your support.` });
    }
    s.expoBids = s.expoBids.filter(b => b.year > s.year || (b.year === s.year && s.q < 1));

    if (G.rnd(s) < 0.55) {
      const x = G.rnd(s);
      const city = () => G.pick(s, CITIES.filter(c => !G.cityClosed(s, 0, c.code) || true));
      let e;
      if (x < 0.1) e = { kind: 'fuel', mult: 1.25, left: 2, text: 'Oil prices jump. Fuel costs up 25% for two quarters.' };
      else if (x < 0.32) { const c = city(); e = { kind: 'city', city: c.code, mult: 1.35, left: 4, text: `Tourism boom in ${c.name}. Demand up 35% for a year.` }; }
      else if (x < 0.44) { const r = G.pick(s, REGIONS); e = { kind: 'region', region: r.id, mult: 0.82, left: 4, text: `Recession in ${r.name}. Travel demand down 18% for a year.` }; }
      else if (x < 0.54) { const c = city(); e = { kind: 'city', city: c.code, mult: 0.5, left: 1, text: `Ground staff strike at ${c.name}. Demand halved this quarter.` }; }
      else if (x < 0.62) { const c = city(); e = { kind: 'city', city: c.code, mult: 0.6, left: 2, text: `Floods hit ${c.name}. Demand down 40% for two quarters.` }; }
      else if (x < 0.8) {
        const opts = G.buyableTypes(s, 0);
        if (opts.length) { const p = G.pick(s, opts); e = { kind: 'sale', type: p.id, mult: 0.8, left: 1, text: `${p.maker} sale: ${p.name} 20% off this quarter.` }; }
      } else if (x < 0.9) { const r = G.pick(s, REGIONS); e = { kind: 'region', region: r.id, mult: 1.15, left: 6, text: `Economic upswing in ${r.name}. Demand up 15%.` }; }
      else { const c = G.pick(s, CITIES.filter(c => c.major)); e = { kind: 'city', city: c.code, mult: 1.25, left: 2, text: `${c.name} hosts a major summit and trade fair. Demand +25%.` }; }
      if (e) { s.events.push(e); rep.world.push({ text: e.text }); crisisFrom(s, e); }
    }
  };
  // Big shocks ask the player for a decision (one a quarter).
  function crisisFrom(s, e) {
    if (s.crisis && s.crisis.id === s.turn) return;
    if (e.kind === 'fuel' || ((e.kind === 'region' || e.kind === 'world') && e.mult <= 0.85)) G.makeCrisis(s, e);
  }

  // ---------- requests to the player ----------
  let reqId = 1;
  G.makeRequests = function (s) {
    s.requests = [];
    const A = s.airlines[0];
    const present = Object.keys(A.slots).filter(c => A.slots[c] > 0);
    if (!present.length) return;
    const n = G.rnd(s) < 0.6 ? 1 : G.rnd(s) < 0.35 ? 2 : 0;
    for (let k = 0; k < n; k++) {
      const code = G.pick(s, present), c = CITY[code], st = G.cityStats(s, code);
      const x = G.rnd(s);
      let q;
      if (x < 0.25) q = { kind: 'terminal', cost: Math.round(6 + st.econ * 1.5), rel: 15, text: `${c.name} airport asks you to help fund a new terminal.`, effect: 'Airport capacity +20%, you get 5 extra slots, relations +15.' };
      else if (x < 0.45 && c.tour >= 6) q = { kind: 'tourism', cost: Math.round(4 + c.tour * 0.6), rel: 10, text: `${c.name}'s tourism board wants a partner for a promotion.`, effect: 'Demand to the city +15% for a year, relations +10.' };
      else if (x < 0.65) {
        if (s.contracts.length >= 3 || s.contracts.some(k => k.city === code)) continue;
        const flown = G.routesOf(s, 0).filter(r => (r.a === code || r.b === code) && r.freq <= 17);
        let other;
        if (flown.length && G.rnd(s) < 0.4) { const r = G.pick(s, flown); other = r.a === code ? r.b : r.a; }
        else {
          const others = CITIES.filter(o => o.major && o.code !== code && !G.cityClosed(s, 0, o.code) && !(G.coldWar(s) && (G.blocClash(A.bloc, o.bloc) || G.blocClash(c.bloc, o.bloc))) && !G.routesOf(s, 0).some(r => G.pairKey(r.a, r.b) === G.pairKey(code, o.code)) && G.dist(code, o.code) < 9000);
          if (!others.length) continue;
          other = G.pick(s, others).code;
        }
        q = { kind: 'contract', cost: 0, rel: 3, ...G.contractOffer(s, code, other) };
        q.effect = G.contractEffect({ ...q, city: code });
      } else if (x < 0.8) q = { kind: 'charity', cost: Math.round(2 + st.econ * 0.4), rel: 12, text: `${c.name} is raising money for its children's hospital.`, effect: 'Relations +12.' };
      else if (c.major) q = { kind: 'expo', cost: 10, rel: 8, text: `${c.name} is bidding to host a World Expo and wants a sponsor.`, effect: 'Relations +8. If the bid wins next year, demand there +50% for two quarters.' };
      else continue;
      if (s.requests.some(r => r.city === code)) continue;
      s.requests.push({ id: reqId++ + s.turn * 100, city: code, ...q });
    }
  };

  G.checkPromises = function (s, rep) {
    for (const p of s.promises) {
      const kept = G.routesOf(s, 0).some(r => G.pairKey(r.a, r.b) === G.pairKey(p.city, p.other));
      if (kept) { G.addRel(s, 0, p.city, 15); p.done = true; rep.news.push({ text: `${CITY[p.city].name} thanks you for the new ${CITY[p.other].name} flight. Relations +15.`, good: true }); }
      else if (s.turn >= p.due) { G.addRel(s, 0, p.city, -15); p.done = true; rep.news.push({ text: `You broke your promise to ${CITY[p.city].name}. Relations −15.`, bad: true }); }
    }
    s.promises = s.promises.filter(p => !p.done);
  };

  // Relations drift: presence and service build goodwill, absence lets it fade toward the baseline.
  G.driftRelations = function (s) {
    s.airlines.forEach((A, i) => {
      if (A.bankrupt) return;
      const routes = G.routesOf(s, i);
      const touched = new Set();
      for (const r of routes) { touched.add(r.a); touched.add(r.b); }
      for (const code of new Set([...Object.keys(A.rel), ...touched])) {
        let d = 0;
        const n = routes.filter(r => r.a === code || r.b === code).length;
        if (n) d += Math.min(3, n);
        d += G.bizOwned(s, i, code).reduce((t, b) => t + (G.BUSINESSES[b.type].rel || 0) + 0.5, 0);
        if (!n && !A.slots[code]) d += (G.baseRel(s, i, code) - G.rel(s, i, code)) * 0.15;
        if (A.isAI) d *= 1.2;
        if (d) G.addRel(s, i, code, d);
      }
    });
  };
})(globalThis.G);
