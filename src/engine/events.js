// World events (historical and random), city requests, promises and expo bids.
(function (G) {
  'use strict';
  const { CITY, CITIES, REGIONS, REGION } = G;

  // Puts one event into effect: most last a number of quarters in s.events; some act at once.
  // `cities` and `pairs` spread one event (and one news line) over several places.
  G.applyEvent = function (s, e, rep, extra = {}) {
    const base = { ...e, ...extra };
    delete base.cities; delete base.pairs;
    const live = ['region', 'city', 'world', 'fuel', 'pair', 'ground', 'sale', 'sat', 'outage', 'strike', 'firesale', 'rates', 'lease', 'delay'];
    if (e.kind === 'open') ['PEK', 'SHA', 'CAN'].forEach(c => (s.opened[c] = true));
    if (e.kind === 'coldwar') s.coldWarOver = true;
    if (e.kind === 'cap') { s.cap[e.city] += Math.round(s.cap[e.city] * e.grow); }
    if (e.kind === 'rel') for (const c of e.cities) G.addRel(s, e.o, c, e.d);
    if (e.kind === 'brand') { const B = s.airlines[e.o]; B.sat = G.clamp((B.sat ?? 50) + e.d, 0, 100); }
    if (live.includes(e.kind)) {
      if (e.cities) for (const c of e.cities) s.events.push({ ...base, city: c });
      else if (e.pairs) for (const [a, b] of e.pairs) s.events.push({ ...base, a, b });
      else s.events.push(base);
    }
    if (e.fuel) s.events.push({ kind: 'fuel', mult: e.fuel, left: 3, text: `${e.text} Fuel prices jump.` });
    let text = e.text;
    // a grounding names what it takes off your schedule
    if (e.kind === 'ground') {
      const mine = G.routesOf(s, 0).filter(r => r.type === e.type);
      if (mine.length) text += ` ${mine.length} of your routes fly the ${G.PLANE[e.type].name}: ${e.share >= 1 ? 'they earn nothing' : `about ${Math.round(e.share * 100)}% of their flights are cancelled`} while it lasts, but the aircraft still cost money.`;
    }
    if (e.kind === 'cap') text += ` ${CITY[e.city].name} now has ${Math.max(0, G.airportFree(s, e.city))} free slots.`;
    // shocks that cut demand or raise fuel read as bad news even when the table does not say so
    const bad = e.bad || (!e.good && ((['region', 'city', 'world', 'pair'].includes(e.kind) && e.mult < 1) || (e.kind === 'fuel' && e.mult > 1)));
    rep.world.push({ text, hist: !!extra.hist, ...(e.good ? { good: true } : bad ? { good: false } : {}) });
    crisisFrom(s, e);
    if (e.fuel) crisisFrom(s, { kind: 'fuel', mult: e.fuel, left: 3, text: e.text });
  };

  // Called after the calendar advances: applies anything scheduled for the new quarter.
  G.tickEvents = function (s, rep) {
    const sc = s.scenario && G.SCENARIO[s.scenario];
    for (const h of [...G.HISTORY, ...((sc && sc.shocks) || [])]) {
      if (h.y !== s.year || h.q !== s.q) continue;
      G.applyEvent(s, h, rep, { hist: true });
    }
    for (const [y, c, q] of G.OLYMPICS) {
      if (y === s.year + 1 && s.q === 0) {
        s.events.push({ kind: 'city', city: c, mult: 1.15, left: 4, text: `${CITY[c].name} prepares to host the Olympic Games.` });
        rep.world.push({ text: `${CITY[c].name} gears up for the ${y} Olympics. Demand there is rising.` });
      }
      if (y === s.year && s.q === q) {
        s.events.push({ kind: 'city', city: c, mult: 1.7, left: 1, text: `The Olympic Games in ${CITY[c].name}.` });
        rep.world.push({ text: `The Olympic Games open in ${CITY[c].name}. Demand +70% this quarter.` });
      }
    }
    for (const [y, c, q] of G.WORLD_CUPS) if (y === s.year && s.q === q) {
      s.events.push({ kind: 'city', city: c, mult: 1.35, left: 1, text: `The football World Cup in ${CITY[c].name}.` });
      rep.world.push({ text: `The football World Cup kicks off, with the final in ${CITY[c].name}. Demand there +35% this quarter.` });
    }
    for (const [y, c] of G.EXPOS) if (y === s.year && s.q === 1) {
      s.events.push({ kind: 'city', city: c, mult: 1.3, left: 2, text: `World Expo in ${CITY[c].name}.` });
      rep.world.push({ text: `The World Expo opens in ${CITY[c].name}. Demand there +30% for six months.` });
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
      const e = randomEvent(s);
      if (e) G.applyEvent(s, e, rep);
    }
  };

  // ---------- random events ----------
  // Each entry: weight, optional years and season (0-based quarter) when it can happen, and a maker
  // that returns the event or null when it does not fit this game right now.
  const inCities = (s, codes) => codes.filter(c => CITY[c]).map(c => CITY[c]);
  const pickC = (s, list) => list.length ? G.pick(s, list) : null;
  const flying = s => s.airlines.map((B, j) => j).filter(j => !s.airlines[j].bankrupt && G.routesOf(s, j).length);
  const rivals = s => s.airlines.map((B, j) => j).filter(j => j > 0 && !s.airlines[j].bankrupt && G.routesOf(s, j).length);
  const RANDOM = [
    // the economy and fuel
    { w: 10, make: s => ({ kind: 'fuel', mult: 1.25, left: 2, text: 'Oil prices jump. Fuel costs up 25% for two quarters.' }) },
    { w: 5, make: s => ({ kind: 'fuel', mult: 0.88, left: 2, good: true, text: 'Oil prices ease. Fuel costs down 12% for two quarters.' }) },
    { w: 10, make: s => { const r = G.pick(s, REGIONS); return { kind: 'region', region: r.id, mult: 0.82, left: 4, text: `Recession in ${r.name}. Travel demand down 18% for a year.` }; } },
    { w: 8, make: s => { const r = G.pick(s, REGIONS); return { kind: 'region', region: r.id, mult: 1.15, left: 6, good: true, text: `Economic upswing in ${r.name}. Demand up 15%.` }; } },
    { w: 4, make: s => { const r = G.pick(s, REGIONS); return { kind: 'region', region: r.id, mult: 1.12, left: 4, good: true, text: `A cheap currency makes ${r.name} a bargain: visitors pour in. Demand up 12% for a year.` }; } },
    { w: 4, from: 1965, make: s => ({ kind: 'fuel', cost: true, quiet: true, mult: 1.04, left: 4, bad: true, text: 'Staff wage settlements across the industry: running costs up 4% for a year.' }) },
    { w: 2, from: 1990, make: s => ({ kind: 'fuel', cost: true, quiet: true, mult: 1.05, left: 4, bad: true, text: 'A pilot shortage pushes up crew pay: running costs up 5% for a year.' }) },
    { w: 4, make: s => { const up = G.rnd(s) < 0.5; return { kind: 'rates', mult: up ? 1.4 : 0.7, left: 4, good: !up, bad: up, text: up ? 'Central banks raise interest rates: loan interest up 40% for a year.' : 'Central banks cut interest rates: loan interest down 30% for a year.' }; } },
    // cities: booms, summits, festivals, films
    { w: 14, make: s => { const c = G.pick(s, CITIES); return { kind: 'city', city: c.code, mult: 1.35, left: 4, good: true, text: `Tourism boom in ${c.name}. Demand up 35% for a year.` }; } },
    { w: 6, make: s => { const c = G.pick(s, CITIES.filter(c => c.major)); return { kind: 'city', city: c.code, mult: 1.25, left: 2, good: true, text: `${c.name} hosts a major summit and trade fair. Demand +25%.` }; } },
    { w: 3, from: 1960, make: s => { const c = pickC(s, CITIES.filter(c => c.tour >= 7)); return c && { kind: 'city', city: c.code, mult: 1.3, left: 4, good: true, text: `A hit film shot in ${c.name} sends fans flocking there. Demand up 30% for a year.` }; } },
    { w: 3, q: 0, make: s => ({ kind: 'city', city: 'GIG', mult: 1.4, left: 1, good: true, text: 'Carnival in Rio draws record crowds. Demand +40% this quarter.' }) },
    { w: 3, q: 2, make: s => ({ kind: 'city', city: 'MUC', mult: 1.3, left: 1, good: true, text: 'Oktoberfest in Munich is bigger than ever. Demand +30% this quarter.' }) },
    { w: 3, q: 0, make: s => ({ kind: 'region', region: 'AS', mult: 1.08, left: 1, good: true, text: 'Lunar New Year: millions travel home across Asia. Demand +8% this quarter.' }) },
    // weather and disasters, in their season
    { w: 4, q: 2, make: s => { const c = pickC(s, inCities(s, ['HKG', 'TPE', 'MNL', 'HND', 'CAN', 'SZX', 'SHA', 'FUK', 'CEB'])); return c && { kind: 'city', city: c.code, mult: 0.7, left: 1, bad: true, text: `A typhoon shuts ${c.name} for days. Demand down 30% this quarter.` }; } },
    { w: 4, q: 2, make: s => { const c = pickC(s, inCities(s, ['MIA', 'MCO', 'HAV', 'CUN', 'SJU', 'MSY', 'IAH', 'KIN'])); return c && { kind: 'city', city: c.code, mult: 0.6, left: 1, bad: true, text: `A hurricane hits ${c.name}. Demand down 40% this quarter.` }; } },
    { w: 4, q: 0, make: s => { const c = pickC(s, inCities(s, ['JFK', 'ORD', 'BOS', 'YYZ', 'YUL', 'DTW', 'MSP', 'DEN', 'FRA', 'LHR', 'SVO', 'ARN', 'HEL', 'OSL'])); return c && { kind: 'city', city: c.code, mult: 0.8, left: 1, bad: true, text: `Blizzards close ${c.name} again and again. Demand down 20% this quarter.` }; } },
    { w: 3, q: 2, make: s => { const c = pickC(s, inCities(s, ['BOM', 'DAC', 'CCU', 'KTM', 'CMB', 'RGN', 'MAA'])); return c && { kind: 'city', city: c.code, mult: 0.7, left: 1, bad: true, text: `Monsoon floods swamp ${c.name}. Demand down 30% this quarter.` }; } },
    { w: 5, make: s => { const c = G.pick(s, CITIES); return { kind: 'city', city: c.code, mult: 0.6, left: 2, bad: true, text: `Floods hit ${c.name}. Demand down 40% for two quarters.` }; } },
    { w: 3, make: s => { const r = G.pick(s, REGIONS); return { kind: 'region', region: r.id, mult: 0.9, fear: 0.08, left: 2, bad: true, text: `A disease scare in ${r.name}: some travellers cancel. Demand down 10% for two quarters.` }; } },
    { w: 4, from: 1968, to: 1976, make: s => { const r = G.pick(s, REGIONS); return { kind: 'region', region: r.id, mult: 0.9, fear: 0.1, left: 1, bad: true, text: `A hijacking in ${r.name} makes headlines. Nervous travellers stay home this quarter.` }; } },
    // airports
    { w: 6, make: s => { const c = G.pick(s, CITIES); return { kind: 'city', city: c.code, mult: 0.5, left: 1, bad: true, text: `Ground staff strike at ${c.name}. Demand halved this quarter.` }; } },
    { w: 3, from: 1970, make: s => ({ kind: 'region', region: 'EU', mult: 0.88, left: 1, bad: true, text: 'Air traffic controllers strike across Europe: flights are cancelled all quarter.' }) },
    { w: 2, make: s => { const c = G.pick(s, CITIES.filter(c => c.major)); return { kind: 'city', city: c.code, mult: 0.55, left: 1, bad: true, text: `A fire closes the main terminal at ${c.name}. Demand down 45% this quarter.` }; } },
    { w: 3, make: s => { const c = pickC(s, CITIES.filter(c => G.airportFree(s, c.code) < s.cap[c.code] * 0.15)); return c && { kind: 'cap', city: c.code, grow: 0.15, good: true, text: `${c.name} opens a new runway: 15% more slots for everyone.` }; } },
    // aircraft makers and lessors
    { w: 12, make: s => { const p = pickC(s, G.buyableTypes(s, 0)); return p && { kind: 'sale', type: p.id, mult: 0.8, left: 1, good: true, text: `${p.maker} sale: ${p.name} 20% off this quarter.` }; } },
    { w: 3, make: s => { const p = pickC(s, G.buyableTypes(s, 0)); return p && { kind: 'delay', maker: p.maker, left: 1, bad: true, text: `${p.maker} has production problems: its deliveries due next quarter will arrive a quarter late.` }; } },
    { w: 2, from: 1960, make: s => { const t = pickC(s, [...new Set(s.routes.map(r => r.type))].filter(t => G.PLANE[t].maker !== 'BAC–Aérospatiale')); return t && { kind: 'ground', type: t, share: 0.5, left: 1, bad: true, text: `Safety inspectors order urgent checks on every ${G.PLANE[t].name}: half their flights are cancelled this quarter.` }; } },
    { w: 3, from: 1975, make: s => ({ kind: 'lease', mult: 0.8, left: 4, good: true, text: 'Lessors have too many aircraft: new leases signed this year cost 20% less, for their whole term.' }) },
    // your airline
    { w: 2, mine: true, make: s => { const cs = [...new Set(G.routesOf(s, 0).flatMap(r => [r.a, r.b]))]; return cs.length && { kind: 'rel', o: 0, d: 5, cities: cs, good: true, text: `${s.airlines[0].name} wins an industry award. Every city you serve thinks better of you: relations +5.` }; } },
    { w: 2, from: 1995, mine: true, make: s => G.routesOf(s, 0).length && { kind: 'outage', o: 0, left: 1, bad: true, text: `A computer failure at ${s.airlines[0].name} scrambles bookings and check-in: every route suffers delays this quarter.` } },
    { w: 2, mine: true, make: s => { const r = pickC(s, G.routesOf(s, 0).filter(r => (r.svc ?? 1) > 0)); return r && { kind: 'sat', route: r.id, o: 0, hit: -12, label: 'Food scare (in the news)', left: 2, bad: true, text: `A food-poisoning scare on your ${r.a}–${r.b} flights makes the papers. Satisfaction there falls for two quarters.` }; } },
    { w: 2, mine: true, make: s => G.routesOf(s, 0).length && { kind: 'sat', o: 0, hit: -4, label: 'Lost-luggage stories', left: 2, bad: true, text: `Stories of lost luggage at ${s.airlines[0].name} go around. Satisfaction on every route dips for two quarters.` } },
    // rivals
    // strikes and scandals can hit any airline, yours included
    { w: 3, make: s => { const j = pickC(s, flying(s)); return j != null && (j === 0
      ? { kind: 'strike', o: 0, left: 1, bad: true, text: `Your pilots strike over pay: half of ${s.airlines[0].name}'s flights are cancelled this quarter.` }
      : { kind: 'strike', o: j, left: 1, good: true, text: `${s.airlines[j].name}'s pilots strike: half its flights are cancelled this quarter. Its passengers are looking for seats.` }); } },
    { w: 2, make: s => { const j = pickC(s, flying(s)); return j != null && (j === 0
      ? { kind: 'sat', o: 0, hit: -8, label: 'Boardroom scandal', left: 3, bad: true, text: `A scandal in ${s.airlines[0].name}'s boardroom makes the front pages. Satisfaction on every route falls for three quarters.` }
      : { kind: 'sat', o: j, hit: -8, label: 'Boardroom scandal', left: 3, good: true, text: `A scandal at ${s.airlines[j].name}: its boss resigns and travellers lose faith. Its satisfaction falls for three quarters.` }); } },
    { w: 2, make: s => { const j = pickC(s, rivals(s)); return j != null && { kind: 'firesale', o: j, left: 2, good: true, text: `${s.airlines[j].name} is short of cash and selling spare slots cheaply for the next two quarters. Look for it in each city's slot market.` }; } },
  ];
  function randomEvent(s) {
    const fits = RANDOM.filter(x => (x.from == null || s.year >= x.from) && (x.to == null || s.year <= x.to) && (x.q == null || x.q === s.q) && (!x.mine || G.routesOf(s, 0).length));
    let t = G.rnd(s) * fits.reduce((v, x) => v + x.w, 0);
    for (const x of fits) { t -= x.w; if (t <= 0) return x.make(s) || null; }
    return null;
  }
  G.RANDOM_EVENTS = RANDOM;
  // Big shocks ask the player for a decision (one a quarter). Cheaper fuel, quiet cost creep and
  // slumps under 15% only make the news.
  function crisisFrom(s, e) {
    if (s.crisis && s.crisis.id === s.turn) return;
    if (e.quiet) return;
    if ((e.kind === 'fuel' && e.mult > 1) || ((e.kind === 'region' || e.kind === 'world') && e.mult <= 0.85)) G.makeCrisis(s, e);
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
