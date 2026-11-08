// Running an airline day to day: cabin layouts, fleet commonality, heavy maintenance and reliability,
// cargo and freighter conversions, peak-time slots, slot trading, and the board's expectations.
(function (G) {
  'use strict';
  const { CITY, PLANE } = G;
  const fail = err => ({ ok: false, err });
  const nf = n => Math.round(n).toLocaleString('en-US');

  // ---------- cabins ----------
  // share: fraction of the cabin floor given to business seats, each taking the room of three economy seats.
  G.CABINS = [
    { id: 0, name: 'All economy', share: 0, blurb: 'Every seat sold cheaply. Most seats, fewest business travellers.' },
    { id: 1, name: 'Two-class', share: 0.12, blurb: 'A business cabin up front: fewer seats, but business travellers pay 2.5× the fare and prefer you.' },
    { id: 2, name: 'Business-heavy', share: 0.25, blurb: 'A big business cabin for busy business routes. Many fewer seats.' },
  ];
  const cab = r => G.CABINS[r.cab || 0];
  G.seatsOn = r => Math.round(PLANE[r.type].seats * (1 - cab(r).share * 2 / 3));
  G.bizSeatsOn = r => Math.round(PLANE[r.type].seats * cab(r).share / 3);

  // ---------- fleet commonality ----------
  // Each extra manufacturer means more pilot training, spares and engineers; extra types cost a little too.
  G.commonality = function (s, i) {
    const types = G.fleetTypes(s.airlines[i]);
    const makers = new Set(types.map(t => PLANE[t].maker)).size;
    const scale = Math.max(0.3, G.eraScale(s));
    const cost = (Math.max(0, makers - 1) * 1.4 + Math.max(0, types.length - makers) * 0.5) * scale;
    return { makers, types: types.length, cost };
  };

  // ---------- heavy maintenance and reliability ----------
  G.CHECK_EVERY = 8; // quarters between heavy checks
  G.sinceCheck = (A, type) => (A.checks && A.checks[type]) || 0;
  G.checkCost = (s, i, type) => Math.round(G.fleetCount(s.airlines[i], type) * PLANE[type].price * 0.015 * 10) / 10;
  G.heavyCheck = function (s, i, type) {
    const A = s.airlines[i], cost = G.checkCost(s, i, type);
    if (A.cash < cost) return fail(`A heavy check costs $${cost}M. Not enough cash.`);
    if (!G.sinceCheck(A, type)) return fail('This fleet has just been checked.');
    // charged with this quarter's costs, so it shows in the profit bridge
    A.maintDue = (A.maintDue || 0) + cost;
    (A.checks ||= {})[type] = 0;
    return { ok: true, cost };
  };
  G.utilisation = function (s, i, type) {
    const flying = G.fleetCount(s.airlines[i], type) - Math.max(0, G.idle(s, i, type));
    const hrs = G.routesOf(s, i).filter(r => r.type === type).reduce((h, r) => h + r.freq * G.rtHours(type, G.dist(r.a, r.b)), 0);
    return flying > 0 ? hrs / (flying * G.HOURS_PER_PLANE) : 0;
  };
  // Chance a route on this type suffers disruption in a quarter. Spare (idle) aircraft absorb most of it.
  G.reliability = function (s, i, type) {
    const A = s.airlines[i], over = Math.max(0, G.sinceCheck(A, type) - G.CHECK_EVERY), util = G.utilisation(s, i, type);
    const spare = G.idle(s, i, type) > 0;
    const risk = G.clamp((0.02 + over * 0.06 + Math.max(0, util - 0.85) * 0.6) * (spare ? 0.35 : 1), 0, 0.6);
    return { over, util, spare, risk, due: G.CHECK_EVERY - G.sinceCheck(A, type) };
  };
  G.disruptions = function (s, i, rep) {
    const A = s.airlines[i], hits = [];
    const outage = s.events.some(e => e.kind === 'outage' && e.o === i);
    for (const t of G.fleetTypes(A)) {
      const R = G.reliability(s, i, t);
      for (const r of G.routesOf(s, i).filter(r => r.type === t && r.last)) {
        if (!outage && G.rnd(s) >= R.risk) continue;
        const L = r.last, k = 0.12;
        const pax0 = L.pax, conn0 = L.conn;
        L.pax = Math.round(L.pax * (1 - k)); L.local = Math.round(L.local * (1 - k)); L.conn = Math.round(L.conn * (1 - k));
        L.lost = { pax: pax0 - L.pax, conn: conn0 - L.conn };
        L.lf *= 1 - k; L.rev *= 1 - k; L.cost *= 1.05; L.profit = L.rev - L.cost; L.disrupted = true;
        r.disrupt = (r.disrupt || 0) + 1;
        hits.push(r);
      }
    }
    if (i === 0 && outage && hits.length) { rep.news.push({ bad: true, text: `The computer outage disrupted all ${hits.length} of your routes: 12% of passengers rebooked elsewhere.` }); return hits; }
    if (i === 0) for (const r of hits) {
      const R = G.reliability(s, 0, r.type);
      rep.news.push({ bad: true, route: r.id, text: `Technical delays on ${r.a}–${r.b}: 12% of passengers rebooked elsewhere.${R.over ? ` Your ${PLANE[r.type].name} fleet is ${R.over} quarter${R.over > 1 ? 's' : ''} overdue for a heavy check.` : !R.spare && R.util > 0.85 ? ` The ${PLANE[r.type].name} fleet is flying ${Math.round(R.util * 100)}% of its hours with no spare aircraft.` : ''}` });
    }
    return hits;
  };

  // ---------- cargo ----------
  // Belly cargo: every passenger flight carries freight too. Earns more on long routes between rich cities.
  G.bellyCargo = function (s, r) {
    const d = G.dist(r.a, r.b), econ = (G.cityStats(s, r.a).econ + G.cityStats(s, r.b).econ) / 2;
    return PLANE[r.type].seats * r.freq * G.WEEKS * 2 * Math.min(d, 9000) / 1e6 * 0.0011 * econ * G.fareIndex(G.yearF(s));
  };
  G.canConvert = (s, i, type) => {
    const A = s.airlines[i], old = A.fleet.filter(f => f.type === type && !f.lease && s.year - f.built >= 10);
    if (!old.length) return `Only owned aircraft at least 10 years old can be converted.`;
    if (G.idle(s, i, type) < 1) return 'Take one off its route first: only idle aircraft can be converted.';
    return null;
  };
  G.convertCost = (s, type) => Math.round(PLANE[type].price * 0.12 * 10) / 10;
  G.convertFreighter = function (s, i, type) {
    const A = s.airlines[i], err = G.canConvert(s, i, type);
    if (err) return fail(err);
    const cost = G.convertCost(s, type);
    if (A.cash < cost) return fail(`Conversion costs $${cost}M. Not enough cash.`);
    const f = A.fleet.filter(f => f.type === type && !f.lease && s.year - f.built >= 10).sort((x, y) => x.built - y.built)[0];
    f.n--; A.fleet = A.fleet.filter(x => x.n > 0);
    G.pay(A, -cost, 'fleet');
    (A.freighters ||= []).push({ type, built: f.built });
    return { ok: true, cost };
  };
  // A converted freighter flies for your cargo arm. Bigger aircraft earn more; very old ones cost more to keep up.
  G.freighterIncome = (s, i, f) => {
    const P = PLANE[f.type], age = s.year - f.built;
    return (P.seats * Math.min(P.range, 9000) / 1e6 * 3 * G.fareIndex(G.yearF(s)) * G.demandIndex(G.yearF(s)) - P.price * G.OWN_RATE * (1 + 0.03 * age)) * G.costMultFor(s, i) ** -0.5;
  };
  G.cargoTotal = (s, i) => G.routesOf(s, i).reduce((t, r) => t + G.bellyCargo(s, r), 0) + (s.airlines[i].freighters || []).reduce((t, f) => t + G.freighterIncome(s, i, f), 0);

  // ---------- peak-time slots ----------
  // At busy airports the morning and evening banks are worth more. Up to 30% of an airport's slots are peak.
  G.peakHeld = (s, i, code) => (s.airlines[i].peak && s.airlines[i].peak[code]) || 0;
  G.peakUsed = (s, i, code, exceptId) => G.routesOf(s, i).filter(r => r.peak && r.id !== exceptId && (r.a === code || r.b === code)).reduce((t, r) => t + r.freq, 0);
  G.peakFree = (s, code) => Math.floor(s.cap[code] * 0.3) - s.airlines.reduce((t, A) => t + ((A.peak && A.peak[code]) || 0), 0);
  G.peakPrice = (s, code) => Math.round(G.slotPrice(s, code) * 1.5 * 100) / 100;
  G.buyPeak = function (s, i, code, n) {
    const A = s.airlines[i];
    if (G.slotsHeld(s, i, code) - G.peakHeld(s, i, code) < n) return fail(`Peak upgrades use slots you already hold. You hold ${G.slotsHeld(s, i, code) - G.peakHeld(s, i, code)} ordinary slots at ${code}.`);
    if (G.peakFree(s, code) < n) return fail(`Only ${Math.max(0, G.peakFree(s, code))} peak slots are left at ${CITY[code].name}.`);
    const cost = G.peakPrice(s, code) * n;
    if (A.cash < cost) return fail(`That costs $${cost.toFixed(1)}M.`);
    G.pay(A, -cost, 'slots');
    (A.peak ||= {})[code] = G.peakHeld(s, i, code) + n;
    return { ok: true, cost };
  };

  // ---------- slot trading ----------
  // Rivals sell slots they aren't using, at a premium; a rival you're at war with charges more, partners less.
  G.slotOffers = function (s, i, code) {
    return s.airlines.map((B, j) => {
      if (j === i || B.bankrupt) return null;
      const partner = G.allied(s, j) || G.allied(s, i);
      // nobody sells you a way into their own hub, or to an airport where you fight them on routes
      if (!partner && B.hubs.includes(code)) return null;
      const fight = s.routes.some(r => r.o === j && (r.a === code || r.b === code) && s.routes.some(x => x.o === i && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b)));
      if (!partner && fight) return null;
      const spare = Math.min(G.slotsAvail(s, j, code) - (B.hubs.includes(code) ? 6 : 0), 12);
      if (spare < 2) return null;
      // a rival that leads this region prices in the threat
      const leader = G.regionLeader(s, CITY[code].region) === j;
      const sale = s.events.some(e => e.kind === 'firesale' && e.o === j);
      const mood = sale ? 1.1 : partner ? 1.5 : leader ? 3.5 : 2.4;
      return { j, n: spare, unit: Math.round(G.slotPrice(s, code) * mood * 100) / 100 };
    }).filter(Boolean);
  };
  G.buySlotsFrom = function (s, i, j, code, n) {
    const o = G.slotOffers(s, i, code).find(x => x.j === j);
    if (!o || o.n < n) return fail('They no longer have that many spare slots.');
    const A = s.airlines[i], B = s.airlines[j], cost = o.unit * n;
    if (A.cash < cost) return fail(`That costs $${cost.toFixed(1)}M.`);
    G.pay(A, -cost, 'slots'); G.pay(B, cost, 'slots');
    B.slots[code] -= n; A.slots[code] = (A.slots[code] || 0) + n;
    if (B.peak && B.peak[code] > B.slots[code]) B.peak[code] = B.slots[code];
    return { ok: true, cost };
  };

  // ---------- the board ----------
  // The board sets one target at a time, harder once the airline is comfortable. Hitting targets builds
  // confidence; missing them erodes it. At zero confidence you are replaced.
  const sum4 = (A, k) => A.history.slice(-4).reduce((t, h) => t + (h[k] || 0), 0);
  const cities = (s, i) => new Set(G.routesOf(s, i).flatMap(r => [r.a, r.b])).size;
  G.BOARD_GOALS = {
    growth: { name: 'Grow passengers', val: (s, A) => sum4(A, 'pax'), fmt: v => (v / 1e6).toFixed(2) + 'M a year', dir: 1 },
    returns: { name: 'Return on assets', val: (s, A) => G.annualProfit(s, 0) / Math.max(1, G.netAssets(s, 0)), fmt: v => Math.round(v * 100) + '%', dir: 1 },
    service: { name: 'Passenger satisfaction', val: (s, A) => A.sat ?? 50, fmt: v => Math.round(v) + '/100', dir: 1 },
    deploy: { name: 'Put idle cash to work', val: (s, A) => A.cash, fmt: v => G.fmtM(v), dir: -1 },
    network: { name: 'Serve more cities', val: (s, A) => cities(s, 0), fmt: v => v + ' cities', dir: 1 },
  };
  G.boardProgress = function (s) {
    const b = s.board, A = s.airlines[0];
    if (!b || !b.goal) return null;
    const g = b.goal, D = G.BOARD_GOALS[g.kind], now = D.val(s, A);
    const ratio = D.dir > 0 ? (g.target > 0 ? now / g.target : 1) : (now > 0 ? g.target / now : 1);
    return { ...g, name: D.name, now, nowText: D.fmt(now), targetText: D.fmt(g.target), ok: D.dir > 0 ? now >= g.target : now <= g.target, left: g.due - s.turn, ratio: Math.min(1, ratio) };
  };
  function pickGoal(s) {
    const A = s.airlines[0], scale = Math.max(0.3, G.eraScale(s));
    const yearCost = sum4(A, 'cost') || 40 * scale;
    const ap = G.annualProfit(s, 0), na = Math.max(1, G.netAssets(s, 0));
    const last = s.board.last, ctx = G.objectiveContext(s);
    const opts = [];
    // cash counts toward company value, and late in a game there is no time to spend it well
    if (!ctx.cashCounts && ctx.left >= 9 && A.cash > Math.max(150 * scale, yearCost * 1.2)) opts.push({ kind: "deploy", target: Math.round(Math.max(80 * scale, yearCost * 0.6, A.cash * 0.65)), why: `You're sitting on ${G.fmtM(A.cash)}. The board wants it invested in the airline or paid out as a dividend.` });
    // a low-cost airline trades comfort for price on purpose: the board only steps in when it is poor
    const lowcost = ctx.obj === 'lowcost';
    if ((A.sat ?? 50) < (lowcost ? 45 : 58)) opts.push({ kind: 'service', target: Math.min(70, Math.round((A.sat ?? 50) + (lowcost ? 5 : 8))), why: 'Complaints are piling up. The board wants happier passengers.' });
    if (ap / na < 0.08 && G.annualProfit(s, 0) !== 0) opts.push({ kind: 'returns', target: 0.1, why: 'Shareholders expect at least a 10% annual return on the airline\'s assets.' });
    opts.push({ kind: 'growth', target: Math.round(Math.max(1, sum4(A, 'pax')) * 1.2), why: 'The board wants 20% more passengers over the next year.' });
    opts.push({ kind: 'network', target: cities(s, 0) + 4, why: 'The board wants four more destinations on the route map.' });
    const pick = opts.find(o => o.kind !== last) || opts[0];
    return { ...pick, set: s.turn, due: s.turn + 4 };
  }
  G.boardTick = function (s, rep) {
    const A = s.airlines[0];
    s.board ||= { conf: 60, goal: null, last: null };
    const b = s.board, p = G.boardProgress(s);
    if (p && p.left <= 0) {
      if (p.ok) { b.conf = Math.min(100, b.conf + 12); rep.news.push({ good: true, text: `Board target met: ${p.name} (${p.nowText}). Board confidence +12.` }); }
      else {
        // a near miss costs less than ignoring the target altogether
        const pen = Math.round(G.clamp((1 - p.ratio) * 50, 6, 20));
        b.conf -= pen;
        rep.news.push({ bad: true, urgent: true, text: `Board target missed: ${p.name} reached ${p.nowText} against ${p.targetText}. Board confidence −${pen}.` });
      }
      b.last = b.goal.kind; b.goal = null;
    } else if (p && p.left === 1 && !p.ok) rep.news.push({ urgent: true, text: `Board target due next quarter: ${p.name}, now ${p.nowText}, target ${p.targetText}.` });
    // steady results reassure the board; losses and junk credit worry it
    const f = A.lastFin;
    if (f) {
      const drift = f.profit > 0 && G.ratingIdx(s, 0) <= 3 ? 1 : f.profit < 0 ? -3 : 0;
      b.conf = G.clamp(b.conf + drift, -100, 100);
    }
    if (!s.endless && b.conf <= 25 && b.conf > 0 && (!b.warned || s.turn - b.warned >= 4)) { b.warned = s.turn; rep.news.push({ bad: true, urgent: true, text: `Board confidence is down to ${b.conf}. At zero you will be replaced. Meet the current target or pay a dividend.` }); }
    // in the last year the board stops setting targets and waits for the final result
    // the board meets as this quarter closes, so the quarters still to play are one fewer than now
    const ctx = G.objectiveContext(s), after = ctx.left - 1;
    if (!b.goal && after <= 4 && !s.sandbox && !b.finalSaid && after > 0) {
      b.finalSaid = true;
      rep.news.push({ text: `The board sets no new targets in the final year. It will judge you on the objective: ${ctx.measures[0]}.` });
    }
    if (!b.goal && s.turn >= 3 && A.history.length >= 4 && (after > 4 || s.sandbox)) {
      b.goal = pickGoal(s);
      rep.news.push({ text: `New board target: ${G.BOARD_GOALS[b.goal.kind].name}, ${G.BOARD_GOALS[b.goal.kind].fmt(b.goal.target)} within a year. ${b.goal.why}` });
    }
    if (b.conf <= 0 && !s.over && !s.endless) s.over = { kind: 'fired', text: 'The board lost confidence in you and appointed a new chief executive.' };
  };
  G.payDividend = function (s, amt) {
    const A = s.airlines[0];
    if (amt <= 0 || A.cash < amt) return fail('Not enough cash for that dividend.');
    s.board ||= { conf: 60, goal: null, last: null };
    G.pay(A, -amt, 'dividend');
    const gain = Math.min(10, Math.round(amt / Math.max(1, G.companyValue(s, 0)) * 60));
    s.board.conf = Math.min(100, s.board.conf + gain);
    A.dividends = (A.dividends || 0) + amt;
    return { ok: true, gain };
  };
})(globalThis.G);
