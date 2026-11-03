// Game setup, the quarter-end sequence, and win conditions.
(function (G) {
  'use strict';
  const { CITY, CITIES, REGIONS, PLANE, ERA } = G;

  function airportCap(s, code) {
    const st = G.cityStats(s, code);
    return Math.round(10 + st.pop * 1.8 + st.econ * 2.8);
  }

  function starterFleet(s, i) {
    const A = s.airlines[i];
    const own = G.buyableTypes(s, i).filter(p => A.bloc === 'N' || p.bloc === A.bloc);
    const types = own.length ? own : G.buyableTypes(s, i);
    const short = types.filter(p => p.range >= 2000).sort((x, y) => (x.hourly / x.seats + x.price / x.seats / 40) - (y.hourly / y.seats + y.price / y.seats / 40))[0];
    const long = types.slice().sort((x, y) => y.range - x.range || x.price - y.price)[0];
    const fleet = [{ type: short.id, n: 3, built: s.year - 2 }];
    fleet.push({ type: long.id, n: 1, built: s.year - 1 });
    return fleet;
  }

  function newAirline(s, o) {
    return {
      name: o.name, ceo: o.ceo, face: o.face, color: o.color, home: o.home, bloc: CITY[o.home].bloc,
      isAI: !!o.pers, pers: o.pers || null, cash: s.startCash || ERA[s.era].cash, hubs: [o.home], slots: { [o.home]: 40 },
      fleet: [], orders: [], pending: [], ads: [], agentsUsed: 0, rel: {},
      bankrupt: false, history: [], yr: { profit: 0, pax: {} }, lastYr: null, lastFin: null, starters: [],
      sat: 50, debt: 0, debtRate: 0, borrowed: 0, hedge: null,
    };
  }

  G.HOME_POOL = ['JFK', 'LHR', 'HND', 'FRA', 'HKG', 'CDG', 'SYD', 'LAX', 'SIN', 'GRU', 'SVO', 'DXB', 'MEX', 'JNB', 'BOM', 'CAI', 'EZE', 'GMP', 'ORD'];

  G.newGame = function (o) {
    const sc = o.scenario && G.SCENARIO[o.scenario];
    if (sc) o = { ...o, era: sc.era, home: sc.home, goal: sc.goal };
    const era = ERA[o.era] ? o.era : 2000;
    const year = sc ? sc.start : era;
    const s = {
      v: 4, seed: (o.seed ?? Date.now()) | 0, era, year, q: 0, end: sc ? sc.start + sc.years : ERA[era].end, turn: 0,
      goal: o.goal || 'world', scenario: sc ? sc.id : null, startCash: sc ? sc.cash : 0, contracts: [], crisis: null,
      difficulty: o.difficulty || 5, over: null, routes: [], events: [], nextId: 1, cap: {}, airlines: [],
      biz: {}, requests: [], promises: [], expoBids: [], opened: {}, coldWarOver: year >= 1991, log: [],
      tut: {}, cityPax: null, meeting: [], reports: [], lastRep: null, alliances: [], ms: {}, dealCool: {},
    };
    if (year >= 1979) ['PEK', 'SHA', 'CAN'].forEach(c => (s.opened[c] = true));
    for (const c of CITIES) s.cap[c.code] = airportCap(s, c.code);
    s.airlines.push(newAirline(s, { name: o.name || 'Contrail Air', ceo: o.ceo || 'You', face: o.face ?? 7, color: G.COLORS[0], home: o.home }));

    const pers = Object.keys(G.PERSONALITIES);
    for (let k = pers.length - 1; k > 0; k--) { const j = Math.floor(G.rnd(s) * (k + 1)); [pers[k], pers[j]] = [pers[j], pers[k]]; }
    const people = G.RIVALS.slice();
    const usedRegions = new Set([CITY[o.home].region]);
    const pool = G.HOME_POOL.filter(c => c !== o.home && !(c === 'DXB' && era < 1985));
    let guard = 0;
    while (s.airlines.length < 4 && guard++ < 500) {
      const c = G.pick(s, pool);
      if (usedRegions.has(CITY[c].region)) continue;
      usedRegions.add(CITY[c].region);
      const p = people.splice(Math.floor(G.rnd(s) * people.length), 1)[0];
      s.airlines.push(newAirline(s, { name: p.airline, ceo: p.ceo, face: Math.floor(G.rnd(s) * 1e6), color: G.COLORS[s.airlines.length], home: c, pers: pers[s.airlines.length - 1] }));
    }
    s.airlines.forEach((A, i) => {
      A.fleet = starterFleet(s, i);
      const longRange = Math.max(...A.fleet.map(f => PLANE[f.type].range));
      const shortRange = PLANE[A.fleet[0].type].range;
      const value = c => G.baseDemand(s, A.home, c.code) * G.baseFare(s, G.dist(A.home, c.code));
      const ok = CITIES.filter(c => !G.routeBlock(s, i, A.home, c.code) && !(G.coldWar(s) && G.blocClash(A.bloc, c.bloc)))
        .sort((x, y) => value(y) - value(x));
      const short = ok.filter(c => G.dist(A.home, c.code) <= shortRange).slice(0, 2);
      const long = ok.find(c => !short.includes(c) && G.dist(A.home, c.code) <= longRange);
      const best = long ? [...short, long] : short;
      for (const c of best) A.slots[c.code] = (A.slots[c.code] || 0) + 8;
      A.starters = best.map(c => c.code);
    });
    G.makeRequests(s);
    s.meeting = [];
    return s;
  };

  G.goalStatus = function (s, i, useLast) {
    const A = s.airlines[i], yr = useLast ? A.lastYr : A.yr;
    const hubRegions = REGIONS.filter(R => A.hubs.some(h => CITY[h].region === R.id)).map(R => R.id);
    const leads = REGIONS.filter(R => {
      const mine = yr.pax[R.id] || 0;
      return mine > 0 && s.airlines.every((B, j) => j === i || B.bankrupt || ((useLast ? B.lastYr : B.yr).pax[R.id] || 0) < mine);
    }).map(R => R.id);
    const homeRegion = CITY[A.home].region;
    return {
      hubRegions, leads, homeLead: leads.includes(homeRegion), profit: yr.profit,
      win: hubRegions.length === REGIONS.length && leads.length >= s.difficulty && leads.includes(homeRegion) && yr.profit > 0,
    };
  };
  G.regionLeader = function (s, rid, useLast) {
    let best = -1, bv = 0;
    s.airlines.forEach((A, i) => {
      const yr = useLast ? A.lastYr : A.yr;
      const v = !A.bankrupt && yr ? (yr.pax[rid] || 0) : 0;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  };

  function resolveSlots(s, rep) {
    const reqs = [];
    s.airlines.forEach((A, i) => A.pending.filter(p => p.kind === 'slots').forEach(p => reqs.push({ i, p, score: G.rel(s, i, p.city) + G.rnd(s) * 25 })));
    reqs.sort((x, y) => y.score - x.score);
    for (const { i, p } of reqs) {
      const A = s.airlines[i], name = CITY[p.city].name;
      const free = Math.max(0, G.airportFree(s, p.city));
      const contested = reqs.filter(x => x.p.city === p.city).length > 1;
      if (G.rnd(s) > G.slotOdds(s, i, p.city)) {
        A.cash += p.cost * 0.8; G.addRel(s, i, p.city, 3);
        if (i === 0) rep.news.push({ text: `Talks in ${name} stalled. 80% of your deposit came back, and relations improved a little.`, bad: true });
        continue;
      }
      const got = Math.min(p.n, free);
      A.slots[p.city] = (A.slots[p.city] || 0) + got;
      if (got < p.n) A.cash += G.slotPrice(s, p.city) * (p.n - got);
      if (i === 0) {
        rep.news.push(got === p.n ? { text: `Secured ${got} weekly slots at ${name}.`, good: true }
          : got > 0 ? { text: `${name} could only release ${got} of ${p.n} slots${contested ? ' — a rival got there too' : ''}. The rest was refunded.` }
            : { text: `${name} is full${contested ? ' — rivals took the last slots' : ''}. Deposit refunded.`, bad: true });
      } else if (got && s.airlines[0].slots[p.city]) rep.rivals.push({ i, kind: 'slots', text: `${A.name} won ${got} slots at ${name}.` });
    }
  }

  // Older saves gain the fields added since they were made.
  G.migrate = function (s) {
    if (!s || s.v >= 4) return s;
    for (const r of s.routes) { r.svc ??= 1; r.hist ||= []; }
    for (const A of s.airlines) Object.assign(A, { sat: A.sat ?? 50, debt: A.debt || 0, debtRate: A.debtRate || 0, borrowed: A.borrowed || 0, hedge: A.hedge || null });
    Object.assign(s, { alliances: s.alliances || [], ms: s.ms || {}, dealCool: s.dealCool || {}, goal: s.goal || 'world', contracts: s.contracts || [], crisis: s.crisis || null, v: 4 });
    for (const c of CITIES) s.cap[c.code] ??= airportCap(s, c.code);
    return s;
  };

  G.endQuarter = function (s) {
    if (s.over) return null;
    const rep = { year: s.year, q: s.q, news: [], rivals: [], world: [], fin: null, results: [], yearEnd: null };
    for (let i = 1; i < s.airlines.length; i++) G.aiTurn(s, i, rep);
    const net = G.runNetwork(s);
    for (const x of net.R.values()) x.r.last = G.routeResult(x);
    s.cityPax = s.airlines.map(() => ({}));
    for (const od of net.ods) for (const p of od.opts) {
      const q = p.carried * 2 * G.WEEKS;
      s.cityPax[p.k][od.o] = (s.cityPax[p.k][od.o] || 0) + q;
      s.cityPax[p.k][od.d] = (s.cityPax[p.k][od.d] || 0) + q;
    }

    s.airlines.forEach((A, i) => {
      if (A.bankrupt) return;
      const rs = G.routesOf(s, i);
      const f = { rev: 0, flight: 0, own: 0, lease: 0, slots: 0, overhead: 0, biz: 0, interest: 0, pax: net.paxTotal[i] };
      for (const r of rs) { f.rev += r.last.rev; f.flight += r.last.cost; r.age++; }
      for (const fl of A.fleet) {
        if (fl.lease) f.lease += fl.n * PLANE[fl.type].price * G.LEASE_RATE;
        else f.own += fl.n * PLANE[fl.type].price * G.OWN_RATE * (1 + 0.02 * (s.year - fl.built));
      }
      for (const [c, n] of Object.entries(A.slots)) f.slots += n * G.slotFee(s, c);
      f.overhead = (1.5 + 0.3 * rs.length + A.hubs.length * 1.0) * G.eraScale(s);
      for (const [code, list] of Object.entries(s.biz)) for (const b of list) if (b.o === i) {
        let v = G.bizIncome(s, code, b);
        if (G.BUSINESSES[b.type].volatile) v *= 0.4 + G.rnd(s) * 1.4;
        f.biz += v;
      }
      f.interest = (A.debt || 0) * (A.debtRate || 0) + (A.cash < 0 ? -A.cash * G.overdraftRate(s, i) : 0);
      f.cost = f.flight + f.own + f.lease + f.slots + f.overhead + f.interest;
      f.profit = f.rev + f.biz - f.cost;
      A.cash += f.profit;
      A.yr.profit += f.profit;
      for (const [rid, v] of Object.entries(net.regionPax[i])) A.yr.pax[rid] = (A.yr.pax[rid] || 0) + v;
      A.lastFin = f;
      A.history.push({ y: s.year, q: s.q, cash: A.cash, profit: f.profit, pax: f.pax });
      if (A.history.length > 80) A.history.shift();
      G.updateSat(s, i);
    });
    G.recordQuarter(s);

    resolveSlots(s, rep);
    s.airlines.forEach((A, i) => {
      if (A.bankrupt) return;
      for (const p of A.pending.filter(p => p.kind === 'hub')) {
        A.hubs.push(p.city);
        const extra = Math.max(0, Math.min(15, G.airportFree(s, p.city)));
        A.slots[p.city] = (A.slots[p.city] || 0) + extra;
        G.addRel(s, i, p.city, 10);
        if (i === 0) rep.news.push({ text: `Your hub in ${CITY[p.city].name} is open, with ${extra} extra slots. All of ${G.REGION[CITY[p.city].region].name} is now in reach.`, good: true });
        else rep.rivals.push({ i, kind: 'hub', text: `${A.name} opened a hub in ${CITY[p.city].name}.` });
      }
      A.pending = [];
      for (const o of A.orders) {
        A.fleet.push({ type: o.type, n: o.n, built: s.year, ...(o.lease ? { lease: true } : {}) });
        if (i === 0) rep.news.push({ text: `Delivered: ${o.n} × ${PLANE[o.type].name}${o.lease ? ' (leased)' : ''}.` });
      }
      A.orders = [];
      A.ads.forEach(x => x.left--); A.ads = A.ads.filter(x => x.left > 0);
      A.agentsUsed = 0;
      if (A.fuelSave && --A.fuelSave.left <= 0) { if (i === 0) rep.news.push({ text: 'The fuel-saving retrofits have run their course.' }); A.fuelSave = null; }
      if (A.hedge && --A.hedge.left <= 0) { if (i === 0) rep.news.push({ text: 'Your fuel hedge has expired. You now pay market prices.' }); A.hedge = null; }
      if (A.cash < -G.creditLimit(s, i)) {
        A.bankrupt = true;
        s.routes = s.routes.filter(r => r.o !== i);
        A.slots = {};
        for (const list of Object.values(s.biz)) for (let k = list.length - 1; k >= 0; k--) if (list[k].o === i) list.splice(k, 1);
        rep.world.push({ text: i === 0 ? 'Your lenders called in their loans.' : `${A.name} has gone bankrupt! Its slots and businesses are back on the market.`, good: i !== 0 });
      }
    });
    s.alliances.forEach(x => x.left--);
    for (const x of s.alliances.filter(x => x.left <= 0)) rep.news.push({ text: `Your codeshare with ${s.airlines[x.j].name} has ended.` });
    s.alliances = s.alliances.filter(x => x.left > 0 && !s.airlines[x.j].bankrupt);
    G.driftRelations(s);
    G.checkPromises(s, rep);
    G.checkContracts(s, rep);

    rep.fin = s.airlines[0].lastFin;
    rep.results = G.routesOf(s, 0).map(r => ({ id: r.id, a: r.a, b: r.b, ...r.last }));
    s.events.forEach(e => e.left--);
    s.events = s.events.filter(e => e.left > 0);

    if (s.airlines[0].bankrupt) s.over = { kind: 'bankrupt', text: 'Your airline went bankrupt.' };
    else if (s.q === 3) {
      const goals = s.airlines.map((A, i) => (A.bankrupt ? null : G.goalStatus(s, i)));
      rep.yearEnd = {
        year: s.year, goals,
        regions: REGIONS.map(R => ({ id: R.id, leader: G.regionLeader(s, R.id), pax: s.airlines.map(A => A.yr.pax[R.id] || 0) })),
        totals: s.airlines.map(A => Object.values(A.yr.pax).reduce((t, v) => t + v, 0)),
        profits: s.airlines.map(A => A.yr.profit),
      };
      const winner = G.objectiveWon(s, 0) ? 0 : goals.findIndex((g, i) => i > 0 && g && g.win);
      if (winner === 0) s.over = { kind: 'win', text: s.goal === 'world' ? `You built the world's leading airline in ${s.year}.` : `${G.OBJECTIVES[s.goal].name}: objective achieved in ${s.year}.` };
      else if (winner > 0) s.over = { kind: 'lose', text: `${s.airlines[winner].name} dominated world air travel in ${s.year}.` };
      else if (s.airlines.slice(1).every(A => A.bankrupt) && !s.airlines.some(A => A.taken)) s.over = { kind: 'win', text: 'Every rival went bankrupt. The skies are yours.' };
      for (const A of s.airlines) { A.lastYr = A.yr; A.yr = { profit: 0, pax: {} }; }
      for (const c of CITIES) {
        const base = airportCap(s, c.code);
        const held = s.airlines.reduce((t, A) => t + (A.slots[c.code] || 0), 0);
        if (held > s.cap[c.code] * 0.85 || base > s.cap[c.code]) {
          const add = Math.max(Math.round(s.cap[c.code] * 0.1), base - s.cap[c.code]);
          s.cap[c.code] += add;
          if (s.airlines[0].slots[c.code]) rep.news.push({ text: `${c.name} airport expands by ${add} weekly slots.` });
        }
      }
    }
    s.q++; s.turn++;
    if (s.q > 3) { s.q = 0; s.year++; }
    if (!s.over && s.year >= s.end) {
      if (s.goal === 'value') {
        const top = G.objectiveChecks(s, 0, true)[0].ok;
        s.over = top ? { kind: 'win', text: `Time's up, and yours is the most valuable airline. Well flown.` } : { kind: 'lose', text: `Time's up. A rival ended up worth more than you.` };
      } else s.over = { kind: 'time', text: s.scenario ? `Time's up before you reached the objective.` : 'Twenty years have passed and no airline dominated the world.' };
    }
    G.tickEvents(s, rep);
    G.makeRequests(s);
    rep.milestones = G.checkMilestones(s);
    rep.scores = s.airlines.map(A => A.score);
    rep.prevScores = s.lastRep && s.lastRep.scores;
    s.log = [];
    s.meeting = s.over ? [] : G.advise(s, rep);
    rep.over = s.over;
    s.lastRep = rep;
    s.reports.push({ year: rep.year, q: rep.q, profit: rep.fin && rep.fin.profit });
    if (s.reports.length > 40) s.reports.shift();
    return rep;
  };
})(globalThis.G);
