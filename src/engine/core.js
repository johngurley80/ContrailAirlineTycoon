// Shared rules and helpers: randomness, geography, city growth, politics, fleet, slots, relations.
(function (G) {
  'use strict';
  const { CITY, PLANE, PLANES } = G;

  G.AGENTS = 3;
  G.HOURS_PER_PLANE = 84;   // block hours per aircraft per week
  G.WEEKS = 13;
  G.MAX_LF = 0.97;
  G.OWN_RATE = 0.018;   // share of an aircraft's price paid each quarter to own and maintain it
  G.AD_TIERS = [{ cost: 6, boost: 0.08 }, { cost: 14, boost: 0.16 }, { cost: 28, boost: 0.26 }];

  G.rnd = function (s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.pick = (s, arr) => arr[Math.floor(G.rnd(s) * arr.length)];
  G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.pairKey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  G.fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

  const distCache = {};
  G.dist = function (a, b) {
    const k = G.pairKey(a, b);
    if (distCache[k] != null) return distCache[k];
    const A = CITY[a], B = CITY[b], R = 6371, r = Math.PI / 180;
    const h = Math.sin((B.lat - A.lat) * r / 2) ** 2 +
      Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin((B.lon - A.lon) * r / 2) ** 2;
    return (distCache[k] = Math.round(2 * R * Math.asin(Math.sqrt(h))));
  };

  G.yearF = s => s.year + s.q / 4;
  // City figures drift with time from their 2000 values.
  const statCache = {};
  G.cityStats = function (s, code) {
    const k = code + s.year;
    if (statCache[k]) return statCache[k];
    const c = CITY[code], dec = (s.year - 2000) / 10;
    return (statCache[k] = {
      econ: G.clamp(c.econ + c.eg * dec, 1, 10),
      pop: c.pop * Math.pow(1 + c.pg, dec),
      tour: c.tour,
    });
  };

  // ---------- politics ----------
  G.coldWar = s => s.year < G.COLD_WAR_ENDS && !s.coldWarOver;
  G.blocClash = (a, b) => (a === 'W' && b === 'E') || (a === 'E' && b === 'W');
  G.cityClosed = function (s, i, code) {
    const c = CITY[code], A = s.airlines[i];
    return c.opens && s.year < c.opens && !s.opened[code] && CITY[A.home].cc !== c.cc;
  };
  G.canBuy = function (s, i, type) {
    const P = PLANE[type], A = s.airlines[i];
    if (s.year < P.intro || s.year > P.sold) return false;
    if (G.coldWar(s) && G.blocClash(A.bloc, P.bloc)) return false;
    return true;
  };
  G.buyableTypes = (s, i) => PLANES.filter(p => G.canBuy(s, i, p.id));
  G.planePrice = function (s, i, type) {
    const P = PLANE[type], A = s.airlines[i];
    let m = s.events.filter(e => e.kind === 'sale' && e.type === type).reduce((v, e) => v * e.mult, 1);
    const home = CITY[A.home].cc;
    if ((P.maker === 'Boeing' || P.maker.includes('Douglas') || P.maker === 'Lockheed') && home === 'US') m *= 0.95;
    if (P.maker === 'Airbus' && ['FR', 'DE', 'GB', 'ES'].includes(home)) m *= 0.95;
    if (P.bloc === 'E' && A.bloc === 'E') m *= 0.85;
    return Math.round(P.price * m * 10) / 10;
  };

  // ---------- fleet ----------
  G.fleetCount = (A, type) => A.fleet.filter(f => f.type === type).reduce((t, f) => t + f.n, 0);
  G.fleetTypes = A => [...new Set(A.fleet.map(f => f.type))];
  G.avgAge = function (s, A, type) {
    let n = 0, t = 0;
    for (const f of A.fleet) if (f.type === type) { n += f.n; t += f.n * (s.year - f.built); }
    return n ? t / n : 0;
  };
  G.routesOf = (s, i) => s.routes.filter(r => r.o === i);
  G.assigned = (s, i, type) => G.routesOf(s, i).filter(r => r.type === type).reduce((t, r) => t + r.planes, 0);
  G.idle = (s, i, type) => G.fleetCount(s.airlines[i], type) - G.assigned(s, i, type);
  G.idleTotal = (s, i) => G.fleetTypes(s.airlines[i]).reduce((t, k) => t + Math.max(0, G.idle(s, i, k)), 0);
  // One idle aircraft of a type with two or more in service is an operational reserve, not surplus:
  // it absorbs technical delays. Anything idle beyond that is surplus.
  G.reserveOf = (s, i, type) => (G.idle(s, i, type) > 0 && G.fleetCount(s.airlines[i], type) - G.idle(s, i, type) >= 2 ? 1 : 0);
  G.surplus = (s, i, type) => Math.max(0, G.idle(s, i, type) - G.reserveOf(s, i, type));
  G.surplusTotal = (s, i) => G.fleetTypes(s.airlines[i]).reduce((t, k) => t + G.surplus(s, i, k), 0);
  G.planeValue = (s, type, age) => PLANE[type].price * 0.7 * Math.pow(0.93, age);
  G.fleetValue = function (s, i) {
    return s.airlines[i].fleet.reduce((t, f) => t + (f.lease ? 0 : f.n * G.planeValue(s, f.type, s.year - f.built)), 0);
  };
  G.maintMult = (s, A, type) => 1 + 0.035 * G.avgAge(s, A, type);
  G.rtHours = (type, d) => 2 * (d / PLANE[type].speed + 0.8);
  G.maxFreq = (type, planes, d) => Math.floor(planes * G.HOURS_PER_PLANE / G.rtHours(type, d));
  G.fuelMult = s => G.oilIndex(G.yearF(s)) * s.events.filter(e => e.kind === 'fuel').reduce((m, e) => m * e.mult, 1);
  G.costMult = s => 0.6 + 0.4 * G.fuelMult(s);

  // ---------- money ----------
  G.baseFare = (s, d) => (70 + 0.1 * d) * G.fareIndex(G.yearF(s));
  // Fixed costs scale with how much money the era's air travel makes.
  G.eraScale = s => G.demandIndex(G.yearF(s)) * G.fareIndex(G.yearF(s));
  G.slotPrice = (s, code) => (0.25 + G.cityStats(s, code).econ * 0.04) * G.eraScale(s);
  G.slotFee = (s, code) => 0.02 * G.cityStats(s, code).econ / 10 * G.eraScale(s);
  G.hubPrice = (s, code) => Math.round((30 + G.cityStats(s, code).econ * 3) * G.eraScale(s));
  G.creditLimit = (s, i) => Math.max(20, 80 + 0.4 * G.fleetValue(s, i) - 0.5 * (s.airlines[i].debt || 0));
  G.agentsOf = (s, i) => G.AGENTS + (s.airlines[i].bonusAgents || 0);
  G.agentsLeft = (s, i) => G.agentsOf(s, i) - s.airlines[i].agentsUsed;

  // ---------- slots ----------
  G.slotsUsed = (s, i, code, exceptId) =>
    G.routesOf(s, i).filter(r => r.id !== exceptId && (r.a === code || r.b === code)).reduce((t, r) => t + r.freq, 0);
  G.slotsHeld = (s, i, code) => s.airlines[i].slots[code] || 0;
  G.slotsAvail = (s, i, code, exceptId) => G.slotsHeld(s, i, code) - G.slotsUsed(s, i, code, exceptId);
  G.airportFree = (s, code) => s.cap[code] - s.airlines.reduce((t, A) => t + (A.slots[code] || 0), 0);

  // ---------- relations ----------
  G.baseRel = function (s, i, code) {
    const A = s.airlines[i], c = CITY[code], h = CITY[A.home];
    if (code === A.home) return 85;
    if (c.cc === h.cc) return 65;
    if (G.coldWar(s) && G.blocClash(A.bloc, c.bloc)) return 15;
    if (c.region === h.region) return 45;
    return 35;
  };
  G.rel = (s, i, code) => s.airlines[i].rel[code] ?? G.baseRel(s, i, code);
  G.addRel = (s, i, code, d) => { s.airlines[i].rel[code] = G.clamp(G.rel(s, i, code) + d, 0, 100); };
  G.relLabel = v => (v >= 75 ? 'Close ally' : v >= 55 ? 'Friendly' : v >= 35 ? 'Neutral' : v >= 20 ? 'Wary' : 'Hostile');

  // ---------- businesses ----------
  G.bizAt = (s, code) => s.biz[code] || [];
  G.bizOwned = (s, i, code, key) => G.bizAt(s, code).filter(b => b.o === i && (!key || G.BUSINESSES[b.type][key]));
  G.cityDemandBoost = function (s, code) {
    return 1 + G.bizAt(s, code).reduce((t, b) => t + (G.BUSINESSES[b.type].demand || 0), 0);
  };
  G.appealAt = (s, i, code) => G.bizOwned(s, i, code).reduce((t, b) => t + (G.BUSINESSES[b.type].appeal || 0) + (G.BUSINESSES[b.type].feed || 0), 0);
  G.costCutAt = (s, i, code) => G.bizOwned(s, i, code).reduce((t, b) => t + (G.BUSINESSES[b.type].costCut || 0), 0);

  // ---------- demand ----------
  // Per-city multiplier from events and businesses; a pair uses the geometric mean of its two cities.
  G.cityMult = function (s, code) {
    const c = CITY[code];
    let m = G.cityDemandBoost(s, code);
    for (const e of s.events) {
      if (e.kind === 'city' && e.city === code) m *= e.mult;
      else if (e.kind === 'region' && e.region === c.region) m *= e.mult;
      else if (e.kind === 'world') m *= e.mult;
    }
    return m;
  };
  const gravCache = {};
  G.gravity = function (s, a, b) {
    const k = s.year + G.pairKey(a, b);
    if (gravCache[k] != null) return gravCache[k];
    const A = G.cityStats(s, a), B = G.cityStats(s, b), d = G.dist(a, b);
    return (gravCache[k] = 520 * Math.sqrt(A.pop * B.pop) * Math.pow((A.econ + B.econ) / 20, 1.5) *
      (0.6 + (A.tour + B.tour) / 25) / Math.pow(1 + d / 2500, 0.7));
  };
  // Weekly travellers each way between two cities at the base fare.
  G.crisisYield = function (s, code) {
    const c = CITY[code];
    let y = 1;
    for (const e of s.events) if (e.mult < 1 && (e.kind === 'world' || (e.kind === 'region' && e.region === c.region) || (e.kind === 'city' && e.city === code))) y *= 0.55 + 0.45 * e.mult;
    return y;
  };
  G.baseDemand = function (s, a, b, cm) {
    const ma = cm ? cm[a] : G.cityMult(s, a), mb = cm ? cm[b] : G.cityMult(s, b);
    return G.gravity(s, a, b) * G.demandIndex(G.yearF(s)) * Math.sqrt(ma * mb);
  };
  G.adBoost = function (s, i, a, b) {
    const regs = [CITY[a].region, CITY[b].region];
    return Math.min(0.4, s.airlines[i].ads.filter(x => regs.includes(x.region)).reduce((v, x) => v + x.boost, 0));
  };
})(globalThis.G);
