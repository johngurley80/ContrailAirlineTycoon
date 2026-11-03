// Strategy helpers and dealings with rivals: the route advisor, the opportunity finder,
// codeshares, buying routes, takeovers, and milestones.
(function (G) {
  'use strict';
  const { CITY, CITIES, PLANE, REGIONS, BUSINESSES } = G;
  const fail = err => ({ ok: false, err });
  const nf = n => Math.round(n).toLocaleString('en-US');

  // ---------- route advisor ----------
  // Tries fares, frequencies, aircraft and service levels in the real network model and keeps the best mix.
  function planesFor(s, type, freq, d) { return Math.max(1, Math.ceil(freq * G.rtHours(type, d) / G.HOURS_PER_PLANE)); }
  G.routeAdvice = function (s, id, quick) {
    const r = s.routes.find(x => x.id === id);
    if (!r) return null;
    const i = r.o, A = s.airlines[i], d = G.dist(r.a, r.b);
    const others = s.routes.filter(x => x.id !== id);
    const ownCost = spec => spec.planes * PLANE[spec.type].price * G.OWN_RATE;
    // Satisfaction is long-lived: a route that annoys passengers costs bookings on the whole network for quarters to come.
    let baseSat = null;
    const score = spec => {
      const net = G.runNetwork(s, [...others, { ...r, ...spec }]);
      let v = 0, rev = 0, pax = 0;
      for (const x of net.R.values()) if (x.r.o === i) { v += x.revQ - x.costQ; rev += x.revQ; pax += x.pax; }
      const me = net.R.get(r.id);
      const rs = G.routeSat(s, { ...r, ...spec, last: { lf: me.lf } }) * (pax ? me.pax / pax : 0);
      if (baseSat === null) baseSat = rs;
      // the player's chosen focus tilts the advice: market share values passengers, satisfaction values happy ones
      const focus = !quick && i === 0 ? A.focus : null;
      return v - ownCost(spec) + rev * 0.006 * (rs - baseSat) * (focus === 'sat' ? 12 : 3) + (focus === 'share' ? pax * 2 * G.WEEKS * 2e-5 * G.eraScale(s) : 0);
    };
    const avail = t => G.idle(s, i, t) + (t === r.type ? r.planes : 0);
    const maxF = (t, planes) => Math.min(G.maxFreq(t, planes, d), G.slotsAvail(s, i, r.a, id), G.slotsAvail(s, i, r.b, id));
    const fit = spec => {
      const need = planesFor(s, spec.type, spec.freq, d);
      if (need > avail(spec.type)) return null;
      const p = Math.max(need, Math.min(spec.planes, need));
      return spec.freq >= 1 && spec.freq <= maxF(spec.type, p) ? { ...spec, planes: p } : null;
    };
    const cur = { type: r.type, planes: r.planes, freq: r.freq, fare: r.fare, svc: r.svc ?? 1 };
    const curV = score(cur);
    let best = { ...cur }, bestV = curV;
    const types = G.fleetTypes(A).filter(t => PLANE[t].range >= d && avail(t) > 0);
    for (let pass = 0; pass < (quick ? 1 : 2); pass++) {
      const tries = [];
      for (const df of quick ? [-10, 10] : [-20, -10, -5, 5, 10, 20]) tries.push({ ...best, fare: G.clamp(best.fare + df, -50, 50) });
      for (const dq of quick ? [-2, 2] : [-4, -2, -1, 1, 2, 4]) tries.push({ ...best, freq: best.freq + dq });
      if (!quick) for (const sv of [0, 1, 2]) if (sv !== best.svc) tries.push({ ...best, svc: sv });
      if (!quick) for (const t of types) if (t !== best.type) {
        const seatsNow = PLANE[best.type].seats * best.freq;
        tries.push({ ...best, type: t, freq: Math.max(1, Math.round(seatsNow / PLANE[t].seats)) });
      }
      let moved = false;
      for (const raw of tries) {
        const spec = fit(raw);
        if (!spec) continue;
        const v = score(spec);
        if (v > bestV + 0.05) { best = spec; bestV = v; moved = true; }
      }
      if (!moved) break;
    }
    const L = r.last || {}, hist = r.hist || [];
    const notes = [];
    if (L.spill > Math.max(500, (L.pax || 0) * 0.08)) notes.push(`This flight was full: about ${nf(L.spill)} passengers a quarter couldn't get a seat.`);
    if (L.blocked > Math.max(500, (L.pax || 0) * 0.08)) notes.push(`About ${nf(L.blocked)} would-be connecting passengers were lost because their other flight was full.`);
    if (L.lf && L.lf < 0.6) notes.push(`Seats are flying ${Math.round((1 - L.lf) * 100)}% empty.`);
    const rivals = s.routes.filter(x => x.o !== i && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b));
    const cheaper = rivals.filter(x => x.fare < r.fare);
    if (cheaper.length) notes.push(`${cheaper.map(x => s.airlines[x.o].name).join(' and ')} ${cheaper.length > 1 ? 'are' : 'is'} cheaper here (${cheaper.map(x => (x.fare >= 0 ? '+' : '') + x.fare + '%').join(', ')}).`);
    if (L.pax && L.conn / L.pax > 0.4) notes.push(`${Math.round(L.conn / L.pax * 100)}% of passengers are connecting. Cutting this route would hurt the rest of your network.`);
    if (hist.length >= 3 && hist.slice(-3).every((h, k, a) => k === 0 || h.profit < a[k - 1].profit)) notes.push('Profit has fallen three quarters running.');
    const age = G.avgAge(s, A, r.type);
    if (age > 15) notes.push(`The ${PLANE[r.type].name} fleet averages ${Math.round(age)} years, which drags on satisfaction and upkeep.`);
    if (!notes.length) notes.push('This route is in reasonable shape.');
    const changes = [];
    if (best.fare !== cur.fare) changes.push(`${best.fare > cur.fare ? 'raise' : 'cut'} the fare to ${best.fare >= 0 ? '+' : ''}${best.fare}%`);
    if (best.type !== cur.type) changes.push(`switch to the ${PLANE[best.type].name}`);
    if (best.freq !== cur.freq) changes.push(`fly ${best.freq} a week instead of ${cur.freq}`);
    if (best.planes !== cur.planes) changes.push(`use ${best.planes} aircraft${best.planes < cur.planes ? ` (frees ${cur.planes - best.planes})` : ''}`);
    if (best.svc !== cur.svc) changes.push(`move to ${G.SERVICE[best.svc].name.toLowerCase()} service`);
    return { cur, best, gain: bestV - curV, changes, notes };
  };

  // ---------- opportunity finder ----------
  G.opportunities = function (s, i, limit = 15) {
    const A = s.airlines[i], out = [];
    const reach = Math.max(0, ...G.buyableTypes(s, i).map(p => p.range), ...G.fleetTypes(A).map(t => PLANE[t].range));
    const ownReach = Math.max(0, ...G.fleetTypes(A).map(t => PLANE[t].range));
    for (const h of A.hubs) for (const c of CITIES) {
      if (G.routeBlock(s, i, h, c.code)) continue;
      if (G.coldWar(s) && G.blocClash(A.bloc, c.bloc)) continue;
      const d = G.dist(h, c.code);
      if (d < 250 || d > reach) continue;
      const demand = G.baseDemand(s, h, c.code);
      const rivalSeats = s.routes.filter(r => r.o !== i && G.pairKey(r.a, r.b) === G.pairKey(h, c.code)).reduce((t, r) => t + PLANE[r.type].seats * r.freq * 0.85, 0);
      let feed = 0;
      for (const r of G.routesOf(s, i)) {
        const x = r.a === h ? r.b : r.b === h ? r.a : null;
        if (!x || x === c.code) continue;
        if ((G.dist(x, h) + d) / G.dist(x, c.code) < 1.5) feed += G.baseDemand(s, x, c.code) * 0.25;
      }
      const unmet = Math.max(0, demand - rivalSeats) + feed;
      const value = unmet * G.baseFare(s, d) * 26 / 1e6;
      if (value < 0.5) continue;
      const slots = Math.min(G.slotsAvail(s, i, h), G.slotsAvail(s, i, c.code));
      const newRegion = !A.hubs.some(x => CITY[x].region === c.region) && c.major;
      out.push({ newRegion, rank: value * (newRegion ? 2.5 : 1), a: h, b: c.code, d, demand: Math.round(demand), unmet: Math.round(unmet), feed: Math.round(feed), rivals: s.routes.filter(r => r.o !== i && G.pairKey(r.a, r.b) === G.pairKey(h, c.code)).length, value, slots, inRange: d <= ownReach });
    }
    const seen = new Set();
    return out.sort((x, y) => y.rank - x.rank).filter(o => { const k = G.pairKey(o.a, o.b); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
  };

  // ---------- codeshares ----------
  G.partners = (s, i) => (s.alliances || []).filter(x => x.left > 0 && (x.j === i || i === 0)).map(x => (i === 0 ? x.j : 0)).filter(j => j !== i);
  G.allied = (s, j) => (s.alliances || []).some(x => x.j === j && x.left > 0);
  const CODESHARE_WILL = { empire: 0.6, luxe: 0.5, budget: 0.35, shark: 0.15 };
  G.codeshareOdds = function (s, j) {
    const B = s.airlines[j];
    let p = CODESHARE_WILL[B.pers] ?? 0.4;
    p += G.companyValue(s, 0) > G.companyValue(s, j) ? 0.1 : -0.1;
    if (B.cash < 0) p += 0.2;
    return G.clamp(p, 0.05, 0.9);
  };
  G.proposeCodeshare = function (s, j) {
    const B = s.airlines[j];
    if (B.bankrupt) return fail(`${B.name} no longer flies.`);
    if (G.allied(s, j)) return fail(`You already codeshare with ${B.name}.`);
    if ((s.dealCool[j] || 0) > s.turn) return fail(`${B.name} won't talk again until ${s.dealCool[j] - s.turn} more quarter(s) pass.`);
    if (G.agentsLeft(s, 0) <= 0) return fail('All your negotiators are busy this quarter.');
    s.airlines[0].agentsUsed++;
    if (G.rnd(s) < G.codeshareOdds(s, j)) {
      s.alliances.push({ j, left: 8 });
      return { ok: true, yes: true, text: `${B.ceo} agrees: a two-year codeshare with ${B.name}. Your flights touching each other's hubs win 10% more passengers, and they'll stop attacking your routes.` };
    }
    s.dealCool[j] = s.turn + 3;
    return { ok: true, yes: false, text: `${B.ceo} turned you down. ${B.name} won't discuss it again for three quarters.` };
  };

  // ---------- buying a rival's route ----------
  const PREMIUM = { shark: 1.6, empire: 1.4, luxe: 1.3, budget: 1.2 };
  G.routePrice = function (s, r) {
    const B = s.airlines[r.o], age = G.avgAge(s, B, r.type);
    const planes = r.planes * G.planeValue(s, r.type, age);
    const slots = r.freq * (G.slotPrice(s, r.a) + G.slotPrice(s, r.b));
    const earn = r.last ? Math.max(0, r.last.profit) * 4 : 0;
    const distressed = B.cash < 50 * G.eraScale(s);
    return Math.round((planes + slots + earn) * (distressed ? 0.9 : PREMIUM[B.pers] || 1.3) * 10) / 10;
  };
  G.routeSaleBlock = function (s, r) {
    const A = s.airlines[0], B = s.airlines[r.o];
    if (![r.a, r.b].some(c => A.hubs.includes(c))) return 'It must touch one of your hubs.';
    if (s.routes.some(x => x.o === 0 && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b))) return 'You already fly this route.';
    const other = A.hubs.includes(r.a) ? r.b : r.a, hub = other === r.b ? r.a : r.b;
    if (G.routeBlock(s, 0, hub, other)) return G.routeBlock(s, 0, hub, other);
    if (B.hubs.includes(r.a) && B.hubs.includes(r.b) && B.cash > 50 * G.eraScale(s)) return `${B.name} won't sell a route between two of its hubs.`;
    return null;
  };
  G.buyRoute = function (s, id) {
    const r = s.routes.find(x => x.id === id), A = s.airlines[0];
    if (!r || r.o === 0) return fail('Route not found.');
    const blk = G.routeSaleBlock(s, r); if (blk) return fail(blk);
    if (G.agentsLeft(s, 0) <= 0) return fail('All your negotiators are busy this quarter.');
    const price = G.routePrice(s, r);
    if (A.cash < price) return fail(`The asking price is $${price}M. Not enough cash.`);
    const B = s.airlines[r.o];
    A.cash -= price; B.cash += price; A.agentsUsed++;
    moveFleet(B, A, r.type, r.planes);
    for (const c of [r.a, r.b]) {
      B.slots[c] = Math.max(0, (B.slots[c] || 0) - r.freq);
      A.slots[c] = (A.slots[c] || 0) + r.freq;
    }
    if (!A.hubs.includes(r.a)) { const t = r.a; r.a = r.b; r.b = t; }
    r.o = 0; r.losses = 0; r.svc ??= 1; r.hist = [];
    return { ok: true, price, text: `You bought ${r.a}–${r.b} from ${B.name} for $${price}M, with ${r.planes} × ${PLANE[r.type].name} and the slots.` };
  };
  function moveFleet(B, A, type, n) {
    let left = n;
    B.fleet.sort((x, y) => y.built - x.built);
    for (const f of B.fleet) {
      if (f.type !== type || !left) continue;
      const k = Math.min(f.n, left);
      f.n -= k; left -= k;
      A.fleet.push({ type, n: k, built: f.built, ...(f.lease ? { lease: true } : {}) });
    }
    B.fleet = B.fleet.filter(f => f.n > 0);
  }

  // ---------- takeovers ----------
  G.takeoverTerms = function (s, j) {
    const B = s.airlines[j];
    if (B.bankrupt) return { block: `${B.name} no longer flies.` };
    const theirs = G.companyValue(s, j), mine = G.companyValue(s, 0);
    const distressed = B.cash < 0;
    const price = Math.round(Math.max(40 * G.eraScale(s), distressed ? theirs * 1.2 : theirs * 2.5));
    if (!distressed && mine < theirs * 3) return { price, block: `${B.ceo} will only sell if ${B.name} is in trouble (cash below zero) or you're worth three times as much (you: ${G.fmtM(mine)}, them: ${G.fmtM(theirs)}).` };
    return { price, block: null, distressed };
  };
  G.takeover = function (s, j) {
    const A = s.airlines[0], B = s.airlines[j], T = G.takeoverTerms(s, j);
    if (T.block) return fail(T.block);
    if (A.cash < T.price) return fail(`The takeover costs $${T.price}M. Not enough cash (a bank loan might help).`);
    A.cash -= T.price;
    A.cash += B.cash; A.debt = (A.debt || 0) + (B.debt || 0);
    for (const r of s.routes.filter(r => r.o === j)) {
      if (s.routes.some(x => x.o === 0 && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b))) { s.routes = s.routes.filter(x => x !== r); continue; }
      r.o = 0; r.svc ??= 1; r.hist = []; r.losses = 0;
    }
    A.fleet.push(...B.fleet);
    for (const [c, n] of Object.entries(B.slots)) A.slots[c] = (A.slots[c] || 0) + n;
    for (const h of B.hubs) if (!A.hubs.includes(h)) A.hubs.push(h);
    for (const list of Object.values(s.biz)) for (const b of list) if (b.o === j) b.o = 0;
    for (const [c, v] of Object.entries(B.rel)) A.rel[c] = Math.max(G.rel(s, 0, c), v);
    B.fleet = []; B.slots = {}; B.hubs = []; B.cash = 0; B.debt = 0; B.bankrupt = true; B.taken = true;
    s.alliances = s.alliances.filter(x => x.j !== j);
    s.tookOver = (s.tookOver || 0) + 1;
    return { ok: true, text: `${B.name} is now part of ${A.name}. Its routes, fleet, hubs, slots and businesses are yours.` };
  };

  // ---------- milestones ----------
  const yrPax = A => A.history.slice(-4).reduce((t, h) => t + (h.pax || 0), 0);
  const nPlanes = A => A.fleet.reduce((t, f) => t + f.n, 0);
  G.MILESTONES = [
    { id: 'route', name: 'Wheels up', text: 'Open your first route.', test: (s, A) => G.routesOf(s, 0).length > 0 },
    { id: 'profit', name: 'In the black', text: 'Make a quarterly profit.', test: (s, A) => A.lastFin && A.lastFin.profit > 0 },
    { id: 'jet', name: 'Jet set', text: 'Fly a jet (cruise 750 km/h or faster).', test: s => G.routesOf(s, 0).some(r => PLANE[r.type].speed >= 750) },
    { id: 'hub2', name: 'Second base', text: 'Open a second hub.', test: (s, A) => A.hubs.length >= 2 },
    { id: 'hub4', name: 'Four corners', text: 'Hubs in four regions.', test: (s, A) => new Set(A.hubs.map(h => CITY[h].region)).size >= 4 },
    { id: 'hub7', name: 'Around the world', text: 'Hubs in all seven regions.', test: (s, A) => new Set(A.hubs.map(h => CITY[h].region)).size >= 7 },
    { id: 'routes20', name: 'Network builder', text: 'Fly 20 routes at once.', test: s => G.routesOf(s, 0).length >= 20 },
    { id: 'fleet25', name: 'Fleet of 25', text: 'Own or lease 25 aircraft.', test: (s, A) => nPlanes(A) >= 25 },
    { id: 'fleet100', name: 'Century', text: 'Own or lease 100 aircraft.', test: (s, A) => nPlanes(A) >= 100 },
    { id: 'pax1m', name: 'A million a year', text: 'Carry 1 million passengers in four quarters.', test: (s, A) => yrPax(A) >= 1e6 },
    { id: 'pax10m', name: 'Ten million', text: 'Carry 10 million passengers in four quarters.', test: (s, A) => yrPax(A) >= 1e7 },
    { id: 'cash1b', name: 'Billionaire', text: 'Hold $1 billion in cash.', test: (s, A) => A.cash >= 1000 },
    { id: 'sat80', name: 'Five-star', text: 'Reach passenger satisfaction of 80.', test: (s, A) => (A.sat ?? 0) >= 80 },
    { id: 'super', name: 'Faster than sound', text: 'Fly a supersonic route.', test: s => G.routesOf(s, 0).some(r => PLANE[r.type].speed >= 1500) },
    { id: 'codeshare', name: 'Partners', text: 'Sign a codeshare with a rival.', test: s => s.alliances.length > 0 },
    { id: 'takeover', name: 'Corporate raider', text: 'Take over a rival airline.', test: s => (s.tookOver || 0) > 0 },
    { id: 'debtfree', name: 'Debt free', text: 'Borrow $100M or more, then repay it all.', test: (s, A) => (A.borrowed || 0) >= 100 && !A.debt },
    { id: 'lead3', name: 'Regional power', text: 'Lead three regions in passengers.', test: s => G.goalStatus(s, 0, true).leads.length >= 3 },
  ];
  G.checkMilestones = function (s) {
    const A = s.airlines[0], got = [];
    if (A.bankrupt) return got;
    for (const m of G.MILESTONES) {
      if (s.ms[m.id]) continue;
      let ok = false;
      try { ok = A.lastYr || m.id !== 'lead3' ? m.test(s, A) : false; } catch (e) { ok = false; }
      if (ok) { s.ms[m.id] = `Q${s.q + 1} ${s.year}`; got.push(m); }
    }
    return got.map(m => ({ id: m.id, name: m.name, text: m.text }));
  };
})(globalThis.G);
