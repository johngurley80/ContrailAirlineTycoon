// Money beyond the day-to-day: credit ratings, bank loans, leasing, fuel hedging, the balance sheet,
// plus passenger satisfaction and the quarterly scorecard that ranks every airline.
(function (G) {
  'use strict';
  const { CITY, PLANE, BUSINESSES } = G;
  const fail = err => ({ ok: false, err });

  G.SERVICE = [
    { id: 0, name: 'Basic', appeal: 0.9, cost: 0.9, sat: -12, blurb: 'Cheaper to run, fewer passengers choose you.' },
    { id: 1, name: 'Standard', appeal: 1, cost: 1, sat: 0, blurb: 'Meals and a smile.' },
    { id: 2, name: 'Premium', appeal: 1.12, cost: 1.15, sat: 14, blurb: 'Lounges, better food, more legroom. Costs more.' },
  ];
  G.LEASE_RATE = 0.035;       // share of an aircraft's price paid each quarter to lease it
  G.RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];
  const RATE = [0.012, 0.015, 0.018, 0.022, 0.028, 0.036, 0.05];

  // ---------- valuation ----------
  G.bizValue = (s, i) => Object.values(s.biz).flat().filter(b => b.o === i).reduce((t, b) => t + BUSINESSES[b.type].cost * 0.7, 0);
  G.annualProfit = (s, i) => s.airlines[i].history.slice(-4).reduce((t, h) => t + h.profit, 0);
  G.netAssets = (s, i) => { const A = s.airlines[i]; return A.cash + G.fleetValue(s, i) + G.bizValue(s, i) - (A.debt || 0); };
  G.companyValue = (s, i) => Math.max(0, G.netAssets(s, i) + Math.max(0, G.annualProfit(s, i)) * 2);

  // ---------- credit ----------
  G.ratingIdx = function (s, i) {
    const A = s.airlines[i], scale = Math.max(0.3, G.eraScale(s));
    const assets = G.fleetValue(s, i) + G.bizValue(s, i) + Math.max(0, A.cash);
    const lev = ((A.debt || 0) + Math.max(0, -A.cash)) / Math.max(1, assets);
    const ap = G.annualProfit(s, i) / (30 * scale);
    let pts = G.clamp(ap, -2, 2) - lev * 4 + (A.cash > 0 ? 0.5 : -1.5);
    return G.clamp(Math.round(3 - pts), 0, 6);
  };
  G.rating = (s, i) => G.RATINGS[G.ratingIdx(s, i)];
  G.loanRate = (s, i) => RATE[G.ratingIdx(s, i)];
  G.borrowLimit = function (s, i) {
    const idx = G.ratingIdx(s, i);
    if (idx >= 6) return 0;
    const base = (G.fleetValue(s, i) + G.bizValue(s, i)) * 0.5 + Math.max(0, G.annualProfit(s, i)) * 1.5;
    // lease commitments are debts too: two years of payments count against the limit
    return Math.max(0, Math.floor(base * (1 - idx * 0.1) - (s.airlines[i].debt || 0) - G.leaseLoad(s, i) * 8));
  };
  // Quarterly lease payments already committed, including aircraft on order.
  G.leaseLoad = (s, i) => {
    const A = s.airlines[i];
    return A.fleet.filter(f => f.lease).reduce((t, f) => t + f.n * PLANE[f.type].price * G.LEASE_RATE, 0)
      + A.orders.filter(o => o.lease).reduce((t, o) => t + o.n * PLANE[o.type].price * G.LEASE_RATE, 0);
  };
  // How much more in quarterly lease payments lessors will accept, judged like a loan on rating, assets and profits.
  G.leaseRoom = function (s, i) {
    const idx = G.ratingIdx(s, i), A = s.airlines[i];
    if (idx >= 6) return 0;
    const base = (G.fleetValue(s, i) + G.bizValue(s, i)) * 0.5 + Math.max(0, G.annualProfit(s, i)) * 1.5 + Math.max(0, A.cash) * 0.3 - (A.debt || 0) * 0.5;
    return Math.max(0, base * (1 - idx * 0.1) / 16 - G.leaseLoad(s, i));
  };
  G.borrow = function (s, i, amt) {
    const A = s.airlines[i];
    if (amt <= 0) return fail('Borrow a positive amount.');
    if (amt > G.borrowLimit(s, i)) return fail(`The bank will lend at most $${G.borrowLimit(s, i)}M at your ${G.rating(s, i)} rating.`);
    const r = G.loanRate(s, i), d = A.debt || 0;
    A.debtRate = d ? (d * (A.debtRate || r) + amt * r) / (d + amt) : r;
    A.debt = d + amt; G.pay(A, amt, 'finance');
    A.borrowed = (A.borrowed || 0) + amt;
    return { ok: true, rate: r };
  };
  G.repay = function (s, i, amt) {
    const A = s.airlines[i];
    amt = Math.min(amt, A.debt || 0);
    if (amt <= 0) return fail('You have no loans to repay.');
    if (A.cash < amt) return fail('Not enough cash to repay that much.');
    G.pay(A, -amt, 'finance'); A.debt -= amt;
    if (A.debt < 0.01) { A.debt = 0; A.debtRate = 0; }
    return { ok: true };
  };
  G.overdraftRate = (s, i) => G.loanRate(s, i) + 0.012;

  // ---------- leasing ----------
  G.leaseCost = (s, i, type) => Math.round(G.planePrice(s, i, type) * G.LEASE_RATE * 100) / 100;
  G.leasedCount = (A, type) => A.fleet.filter(f => f.type === type && f.lease).reduce((t, f) => t + f.n, 0);
  G.ownedCount = (A, type) => G.fleetCount(A, type) - G.leasedCount(A, type);
  // Leases run at least two years. Up front you pay the first quarter plus a security deposit of one
  // quarter, refunded when the aircraft goes back. Handing one back early costs half the remaining payments.
  G.LEASE_TERM = 8;
  G.leasePlanes = function (s, i, type, n) {
    const A = s.airlines[i];
    if (!G.canBuy(s, i, type)) return fail(`${PLANE[type].name} is not available to you this year.`);
    const q = G.leaseCost(s, i, type), pay = q * n * 2;
    const room = G.leaseRoom(s, i);
    if (q * n > room) return fail(`Lessors will take on at most $${room.toFixed(1)}M more a quarter in payments at your ${G.rating(s, i)} rating (this needs $${(q * n).toFixed(1)}M). Grow profits, cash or owned aircraft first.`);
    if (A.cash < pay) return fail(`Up front: the first quarter plus a refundable deposit, $${pay.toFixed(1)}M. Not enough cash.`);
    G.pay(A, -pay, 'fleet');
    A.orders.push({ type, n, lease: true, dep: q });
    return { ok: true, cost: pay };
  };
  G.returnTerms = function (s, i, type) {
    const f = s.airlines[i].fleet.filter(f => f.type === type && f.lease).sort((x, y) => (x.until ?? -1) - (y.until ?? -1))[0];
    if (!f) return null;
    const q = G.leaseCost(s, i, type);
    const left = f.until != null ? Math.max(0, f.until - s.turn) : 0;
    return { fee: f.until != null ? left * q * 0.5 : q, refund: f.dep || 0, left };
  };
  G.returnLease = function (s, i, type, n) {
    const A = s.airlines[i];
    if (n < 1 || n > Math.min(G.idle(s, i, type), G.leasedCount(A, type))) return fail('Only idle leased aircraft can be returned.');
    let fee = 0, refund = 0, left = n;
    for (const f of A.fleet.filter(f => f.type === type && f.lease).sort((x, y) => (x.until ?? -1) - (y.until ?? -1))) {
      if (!left) break;
      const T = G.returnTerms(s, i, type), k = Math.min(f.n, left);
      fee += T.fee * k; refund += T.refund * k; f.n -= k; left -= k;
      A.fleet = A.fleet.filter(x => x.n > 0);
    }
    G.pay(A, refund - fee, 'fleet');
    return { ok: true, fee, refund };
  };

  // ---------- fuel hedging ----------
  G.hedgePrice = (s, i) => Math.max(1, Math.round(((s.airlines[i].lastFin && s.airlines[i].lastFin.flight) || 4) * 0.08 * 10) / 10);
  G.hedgeFuel = function (s, i) {
    const A = s.airlines[i];
    if (A.hedge && A.hedge.left > 0) return fail('You already have a hedge running.');
    const cost = G.hedgePrice(s, i);
    if (A.cash < cost) return fail(`A one-year hedge costs $${cost}M. Not enough cash.`);
    G.pay(A, -cost, 'other');
    A.hedge = { level: G.fuelMult(s), left: 4, cost };
    return { ok: true, cost };
  };
  // Fuel price an airline actually pays; a hedge locks it in.
  G.costMultFor = (s, i) => {
    const A = s.airlines[i], h = A.hedge;
    return (h && h.left > 0 ? 0.6 + 0.4 * h.level : G.costMult(s)) * (A.fuelSave ? A.fuelSave.mult : 1);
  };

  // ---------- slots ----------
  G.returnSlots = function (s, i, code, n) {
    const A = s.airlines[i], free = G.slotsAvail(s, i, code);
    if (n < 1 || n > free) return fail(`Only unused slots can be returned (${Math.max(0, free)} free).`);
    if (A.hubs.includes(code) && G.slotsHeld(s, i, code) - n < 10) return fail('Keep at least 10 slots at a hub.');
    A.slots[code] -= n;
    if (!A.slots[code]) delete A.slots[code];
    const refund = G.slotPrice(s, code) * n * 0.5;
    G.pay(A, refund, 'slots');
    G.addRel(s, i, code, -1);
    return { ok: true, refund };
  };

  // ---------- satisfaction ----------
  // The pieces of a route's satisfaction score, so the player can see what to fix.
  G.satParts = function (s, r) {
    const A = s.airlines[r.o], P = PLANE[r.type];
    const age = G.avgAge(s, A, r.type), lf = r.last ? r.last.lf : 0.75;
    return [
      ['Starting point', 52],
      [`Aircraft comfort (${P.name})`, (P.comfort - 1) * 150],
      [`Aircraft age (${Math.round(age)} yrs)`, -age * 1.1],
      [`${G.SERVICE[r.svc ?? 1].name} service`, G.SERVICE[r.svc ?? 1].sat],
      ['Crowded flights (over 92% full)', -Math.max(0, lf - 0.92) * 160],
      // travellers accept a higher fare when they get more for it: premium service and business cabins
      [`Fare ${r.fare >= 0 ? '+' : ''}${r.fare}%${G.fareAllowance(r) ? ` (${G.fareAllowance(r)}% accepted for the product)` : ''}`, -(r.fare > 0 ? Math.max(0, r.fare - G.fareAllowance(r)) : r.fare) * 0.3],
      [G.CABINS[r.cab || 0].name + ' cabin', [0, 3, 6][r.cab || 0]],
      ['Peak-time departures', r.peak ? 3 : 0],
      ['Technical delays', r.last && r.last.disrupted ? -6 : 0],
    ];
  };
  G.fareAllowance = r => [0, 0, 15][r.svc ?? 1] + [0, 3, 8][r.cab || 0];
  G.routeSat = (s, r) => G.clamp(G.satParts(s, r).reduce((t, p) => t + p[1], 0), 0, 100);
  G.updateSat = function (s, i) {
    const A = s.airlines[i], rs = G.routesOf(s, i).filter(r => r.last && r.last.pax);
    // each route is remembered by its own recent trips: half last quarter, half before
    for (const r of rs) { const now = G.routeSat(s, r); r.rsat = r.rsat == null ? now : r.rsat * 0.5 + now * 0.5; }
    if (!rs.length) return;
    const w = rs.reduce((t, r) => t + r.last.pax, 0);
    const now = rs.reduce((t, r) => t + G.routeSat(s, r) * r.last.pax, 0) / w;
    A.sat = (A.sat ?? 50) * 0.6 + now * 0.4;
  };
  G.satAppeal = A => 0.7 + (A.sat ?? 50) * 0.006;

  // ---------- scorecard and history ----------
  G.SCORE_KEYS = [
    { k: 'margin', name: 'Profit margin', fmt: v => Math.round(v * 100) + '%' },
    { k: 'lf', name: 'Load factor', fmt: v => Math.round(v * 100) + '%' },
    { k: 'pax', name: 'Passengers', fmt: v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.round(v / 1000) + 'k') },
    { k: 'network', name: 'Cities served', fmt: v => String(v) },
    { k: 'sat', name: 'Satisfaction', fmt: v => Math.round(v) + '/100' },
    { k: 'share', name: 'Market share', fmt: v => Math.round(v * 100) + '%' },
  ];
  G.recordQuarter = function (s) {
    const totalPax = s.airlines.reduce((t, A) => t + (A.bankrupt || !A.lastFin ? 0 : A.lastFin.pax), 0) || 1;
    s.airlines.forEach((A, i) => {
      if (A.bankrupt || !A.lastFin) { A.score = null; return; }
      const f = A.lastFin, rs = G.routesOf(s, i);
      const seats = rs.reduce((t, r) => t + G.seatsOn(r) * r.freq * 26, 0);
      const carried = rs.reduce((t, r) => t + (r.last ? r.last.pax : 0), 0);
      const cities = new Set(rs.flatMap(r => [r.a, r.b]));
      const rev = f.rev + Math.max(0, f.biz);
      A.score = {
        margin: rev ? f.profit / rev : 0, lf: seats ? carried / seats : 0, pax: f.pax,
        network: cities.size, sat: A.sat ?? 50, share: f.pax / totalPax,
      };
      const h = A.history[A.history.length - 1];
      Object.assign(h, { rev, routes: rs.length, value: G.companyValue(s, i), sat: A.sat ?? 50, lf: A.score.lf, share: A.score.share, debt: A.debt || 0, cost: f.cost, fin: { ...f } });
      for (const r of rs) {
        if (!r.last) continue;
        const rivalFares = s.routes.filter(x => x.o !== i && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b)).map(x => x.fare);
        (r.hist ||= []).push({ y: s.year, q: s.q, pax: r.last.pax, lf: r.last.lf, profit: r.last.profit, spill: r.last.spill, conn: r.last.conn, fare: r.fare, rf: rivalFares.length ? Math.min(...rivalFares) : null, rivals: rivalFares.length,
          rev: r.last.rev, D: r.last.mkt ? r.last.mkt.D : null, rv: r.last.mkt ? r.last.mkt.rivals : null, mine: r.last.mkt ? r.last.mkt.mine : null });
        if (r.hist.length > 12) r.hist.shift();
      }
    });
  };

  // What changed on a route between its last two quarters, split into the market as a whole
  // (season, events, economy) and the share rivals took from it.
  G.routeImpact = function (r) {
    const h = r && r.hist || [];
    if (h.length < 2) return null;
    const p = h[h.length - 2], n = h[h.length - 1];
    const share = x => (x.mine != null && x.rv != null && x.mine + x.rv > 0 ? x.mine / (x.mine + x.rv) : null);
    return {
      before: p, now: n, dPax: n.pax - p.pax, dProfit: n.profit - p.profit, dRev: n.rev != null && p.rev != null ? n.rev - p.rev : null,
      market: n.D != null && p.D ? n.D / p.D - 1 : null, dRivals: n.rv != null && p.rv != null ? n.rv - p.rv : null,
      shareBefore: share(p), shareNow: share(n), rivalsBefore: p.rivals || 0, rivalsNow: n.rivals || 0, rfBefore: p.rf, rfNow: n.rf,
    };
  };

  // Four quarters ahead, assuming last quarter's trading carries on. Heavy checks fall due on schedule
  // and leased aircraft on order add their payments once delivered. The shock line takes a share of revenue away.
  G.cashForecast = function (s, i, shock = 0.15) {
    const A = s.airlines[i], f = A.lastFin;
    if (!f) return null;
    const trading = f.profit + (f.maint || 0);
    const newLease = A.orders.filter(o => o.lease).reduce((t, o) => t + o.n * G.leaseCost(s, i, o.type), 0);
    const arriving = A.orders.reduce((t, o) => t + o.n, 0);
    const rows = [];
    let cash = A.cash, cashS = A.cash, y = s.year, q = s.q;
    for (let k = 0; k < 4; k++) {
      const checks = G.fleetTypes(A).filter(t => Math.max(0, G.CHECK_EVERY - G.sinceCheck(A, t)) === k).reduce((c, t) => c + G.checkCost(s, i, t), 0);
      const lease = k >= 1 ? newLease : 0, hit = (f.rev || 0) * shock;
      const start = cash;
      cash += trading - checks - lease; cashS += trading - hit - checks - lease;
      rows.push({ y, q, start, trading, checks, lease, end: cash, endS: cashS, hit });
      if (++q > 3) { q = 0; y++; }
    }
    return { rows, trading, newLease, arriving, low: Math.min(...rows.map(r => r.end)), lowS: Math.min(...rows.map(r => r.endS)), floor: -G.creditLimit(s, i), shock };
  };
})(globalThis.G);
