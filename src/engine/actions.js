// Things an airline (player or rival) can do during a quarter. Each returns { ok, err? }.
(function (G) {
  'use strict';
  const { CITY, PLANE, REGION, BUSINESSES } = G;
  const fail = err => ({ ok: false, err });

  // ---------- routes ----------
  G.routeBlock = function (s, i, hub, dest, exceptId) {
    const A = s.airlines[i];
    if (!A.hubs.includes(hub)) return 'Routes must start at one of your hubs.';
    if (hub === dest) return 'Pick a different destination.';
    if (G.cityClosed(s, i, dest)) return `${CITY[dest].name} is closed to foreign airlines until ${CITY[dest].opens}.`;
    if (CITY[dest].region !== CITY[hub].region && !CITY[dest].major && !A.hubs.includes(dest))
      return `${CITY[dest].name} is a regional city. Reach it from a hub in ${REGION[CITY[dest].region].name}.`;
    if (s.routes.some(r => r.o === i && r.id !== exceptId && G.pairKey(r.a, r.b) === G.pairKey(hub, dest)))
      return 'You already fly this route.';
    return null;
  };
  G.originsFor = (s, i, dest) => s.airlines[i].hubs.filter(h => !G.routeBlock(s, i, h, dest));

  G.validateSpec = function (s, i, spec, exceptId) {
    const { a, b, type, planes, freq, fare } = spec;
    const blk = G.routeBlock(s, i, a, b, exceptId);
    if (blk) return blk;
    const d = G.dist(a, b), P = PLANE[type];
    if (!P) return 'Pick an aircraft.';
    if (d > P.range) return `The ${P.name} can't fly ${d.toLocaleString('en-US')} km.`;
    const old = exceptId != null ? s.routes.find(r => r.id === exceptId) : null;
    const free = G.idle(s, i, type) + (old && old.type === type ? old.planes : 0);
    if (planes < 1 || planes > free) return `You have ${free} idle ${P.name}.`;
    const mf = G.maxFreq(type, planes, d);
    if (freq < 1) return 'At least one weekly flight is needed.';
    if (freq > mf) return `${planes} × ${P.name} can fly at most ${mf} round trips a week here.`;
    for (const c of [a, b]) {
      const av = G.slotsAvail(s, i, c, exceptId);
      if (freq > av) return `Not enough slots at ${c}: ${Math.max(0, av)} free. Send a negotiator.`;
    }
    if (fare < -50 || fare > 50) return 'Fare must be within ±50%.';
    return null;
  };
  G.openRoute = function (s, i, spec) {
    const err = G.validateSpec(s, i, spec);
    if (err) return fail(err);
    const r = { id: s.nextId++, o: i, a: spec.a, b: spec.b, type: spec.type, planes: spec.planes, freq: spec.freq, fare: spec.fare, svc: spec.svc ?? 1, age: 0, last: null, losses: 0, hist: [] };
    s.routes.push(r);
    s.log.push({ k: 'open', i, a: r.a, b: r.b, fare: r.fare });
    return { ok: true, route: r };
  };
  G.updateRoute = function (s, id, spec) {
    const r = s.routes.find(x => x.id === id);
    if (!r) return fail('Route not found.');
    const full = { a: r.a, b: r.b, ...spec };
    const err = G.validateSpec(s, r.o, full, id);
    if (err) return fail(err);
    if (full.fare < r.fare - 4) s.log.push({ k: 'cut', i: r.o, a: r.a, b: r.b, fare: full.fare });
    Object.assign(r, { type: full.type, planes: full.planes, freq: full.freq, fare: full.fare, svc: full.svc ?? r.svc ?? 1 });
    return { ok: true, route: r };
  };
  G.closeRoute = function (s, id) {
    const r = s.routes.find(x => x.id === id);
    if (!r) return fail('Route not found.');
    s.routes = s.routes.filter(x => x.id !== id);
    G.addRel(s, r.o, r.a, -2); G.addRel(s, r.o, r.b, -3);
    return { ok: true };
  };

  // ---------- fleet ----------
  G.buyPlanes = function (s, i, type, n) {
    const A = s.airlines[i];
    if (!G.canBuy(s, i, type)) return fail(`${PLANE[type].name} is not for sale to you this year.`);
    if (n < 1) return fail('Order at least one aircraft.');
    const cost = G.planePrice(s, i, type) * n * (n >= 5 ? 0.95 : 1);
    if (A.cash < cost) return fail(`That order costs $${cost.toFixed(0)}M. Not enough cash.`);
    A.cash -= cost;
    A.orders.push({ type, n });
    return { ok: true, cost };
  };
  G.sellPlanes = function (s, i, type, n) {
    const A = s.airlines[i];
    if (n < 1 || n > Math.min(G.idle(s, i, type), G.ownedCount(A, type))) return fail('Only idle aircraft you own can be sold. Return leased ones instead.');
    let left = n, value = 0;
    A.fleet.sort((x, y) => x.built - y.built);
    for (const f of A.fleet) {
      if (f.type !== type || f.lease || !left) continue;
      const k = Math.min(f.n, left);
      f.n -= k; left -= k; value += k * G.planeValue(s, type, s.year - f.built);
    }
    A.fleet = A.fleet.filter(f => f.n > 0);
    A.cash += value;
    return { ok: true, value };
  };

  // ---------- negotiators ----------
  function agent(s, i) { return G.agentsLeft(s, i) > 0 ? null : 'All your negotiators are busy this quarter.'; }
  G.slotBlock = function (s, i, code) {
    const A = s.airlines[i];
    if (G.cityClosed(s, i, code)) return `${CITY[code].name} is closed to foreign airlines until ${CITY[code].opens}.`;
    if (A.pending.some(p => p.city === code)) return `A negotiator is already working in ${CITY[code].name}.`;
    return null;
  };
  G.slotOdds = function (s, i, code) {
    let p = 0.2 + G.rel(s, i, code) / 100 * 0.85;
    if (G.coldWar(s) && G.blocClash(s.airlines[i].bloc, CITY[code].bloc)) p *= 0.5;
    return G.clamp(p, 0.08, 0.97);
  };
  G.negotiateSlots = function (s, i, code, n) {
    const A = s.airlines[i];
    const blk = G.slotBlock(s, i, code) || agent(s, i); if (blk) return fail(blk);
    const cost = G.slotPrice(s, code) * n;
    if (A.cash < cost) return fail(`Slot deposits cost $${cost.toFixed(1)}M. Not enough cash.`);
    A.cash -= cost; A.agentsUsed++;
    A.pending.push({ kind: 'slots', city: code, n, cost });
    return { ok: true, cost };
  };
  G.hubBlock = function (s, i, code) {
    const A = s.airlines[i], C = CITY[code];
    if (A.hubs.includes(code)) return 'Already your hub.';
    if (!C.major) return 'Hubs can only be built in major cities.';
    if (A.hubs.some(h => CITY[h].region === C.region)) return `You already have a hub in ${REGION[C.region].name}.`;
    if (A.pending.some(p => p.kind === 'hub')) return 'You are already building a hub this quarter.';
    if (G.cityClosed(s, i, code)) return `${C.name} is closed to foreign airlines until ${C.opens}.`;
    if (G.coldWar(s) && G.blocClash(A.bloc, C.bloc)) return 'Cold War politics rule out a hub here.';
    if (!G.routesOf(s, i).some(r => (r.a === code && A.hubs.includes(r.b)) || (r.b === code && A.hubs.includes(r.a))))
      return `Fly to ${C.name} from one of your hubs first.`;
    if (G.rel(s, i, code) < 30) return `${C.name} doesn't trust you yet (relations ${Math.round(G.rel(s, i, code))}/100, need 30).`;
    return null;
  };
  G.buildHub = function (s, i, code) {
    const A = s.airlines[i];
    const blk = G.hubBlock(s, i, code) || agent(s, i); if (blk) return fail(blk);
    const cost = G.hubPrice(s, code);
    if (A.cash < cost) return fail(`A hub here costs $${cost}M. Not enough cash.`);
    A.cash -= cost; A.agentsUsed++;
    A.pending.push({ kind: 'hub', city: code, cost });
    return { ok: true, cost };
  };
  G.adCampaign = function (s, i, region, tier) {
    const A = s.airlines[i], T = G.AD_TIERS[tier];
    const blk = agent(s, i); if (blk) return fail(blk);
    if (A.cash < T.cost) return fail(`This campaign costs $${T.cost}M. Not enough cash.`);
    A.cash -= T.cost; A.agentsUsed++;
    A.ads.push({ region, boost: T.boost, left: 4 });
    for (const c of G.CITIES) if (c.region === region && A.slots[c.code]) G.addRel(s, i, c.code, 2);
    return { ok: true };
  };

  // ---------- businesses ----------
  G.bizBlock = function (s, i, code, type) {
    const B = BUSINESSES[type], st = G.cityStats(s, code);
    if (!G.slotsHeld(s, i, code)) return 'You need a presence here (slots) before buying a business.';
    if (G.bizAt(s, code).length >= G.BIZ_SLOTS) return 'All six business plots in this city are taken.';
    if (G.bizAt(s, code).some(b => b.o === i && b.type === type)) return `You already own a ${B.name} here.`;
    if (B.minTour && st.tour < B.minTour) return `${B.name}s need a tourist city (tourism ${B.minTour}+).`;
    return null;
  };
  G.bizIncome = function (s, code, b) {
    const B = BUSINESSES[b.type], st = G.cityStats(s, code);
    const paxHere = s.cityPax && s.cityPax[b.o] ? (s.cityPax[b.o][code] || 0) : 0;
    let v = B.base + B.econ * st.econ + B.tour * st.tour + B.pax * paxHere / 100000;
    v *= Math.sqrt(G.cityMult(s, code) / G.cityDemandBoost(s, code)) * Math.min(1.3, 0.6 + G.demandIndex(G.yearF(s)) * 0.4);
    return v;
  };
  G.buyBusiness = function (s, i, code, type) {
    const A = s.airlines[i], B = BUSINESSES[type];
    const blk = G.bizBlock(s, i, code, type); if (blk) return fail(blk);
    if (A.cash < B.cost) return fail(`A ${B.name} costs $${B.cost}M. Not enough cash.`);
    A.cash -= B.cost;
    (s.biz[code] ||= []).push({ o: i, type, since: s.year });
    G.addRel(s, i, code, 5);
    return { ok: true };
  };
  G.sellBusiness = function (s, i, code, type) {
    const list = G.bizAt(s, code), k = list.findIndex(b => b.o === i && b.type === type);
    if (k < 0) return fail('You don\'t own that business.');
    list.splice(k, 1);
    s.airlines[i].cash += BUSINESSES[type].cost * 0.7;
    G.addRel(s, i, code, -4);
    return { ok: true };
  };

  // ---------- city requests ----------
  G.answerRequest = function (s, id, yes) {
    const q = s.requests.find(x => x.id === id);
    if (!q) return fail('That request has expired.');
    const A = s.airlines[0];
    if (yes) {
      if (A.cash < q.cost) return fail(`You need $${q.cost}M for this.`);
      A.cash -= q.cost;
      G.addRel(s, 0, q.city, q.rel);
      if (q.kind === 'terminal') { s.cap[q.city] += Math.round(s.cap[q.city] * 0.2); A.slots[q.city] = (A.slots[q.city] || 0) + 5; }
      if (q.kind === 'tourism') s.events.push({ kind: 'city', city: q.city, mult: 1.15, left: 4, text: `${CITY[q.city].name} tourism campaign: demand +15%.`, mine: true });
      if (q.kind === 'expo') s.expoBids.push({ city: q.city, year: s.year + 1 });
      if (q.kind === 'route') s.promises.push({ city: q.city, other: q.other, due: s.turn + 2 });
    } else {
      G.addRel(s, 0, q.city, -6);
    }
    s.requests = s.requests.filter(x => x.id !== id);
    return { ok: true };
  };
})(globalThis.G);
