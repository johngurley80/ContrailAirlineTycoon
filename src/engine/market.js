// Network passenger model. Every pair of served cities generates travellers; each airline offers
// a nonstop flight or a one-stop connection through one of its hubs, and travellers split by appeal.
(function (G) {
  'use strict';
  const { CITY, PLANE } = G;

  function appeal(s, k, o, d, legs, cm) {
    const P = legs.map(r => PLANE[r.type]);
    let m = Math.min(...P.map(p => p.comfort));
    if (legs.length === 1 && G.dist(o, d) > 3000) m *= Math.pow(P[0].speed / 850, 0.35);
    m *= 1 + G.adBoost(s, k, o, d);
    m *= 1 + Math.min(0.3, cm.appeal[k][o] + cm.appeal[k][d]);
    m *= 1 + (G.rel(s, k, o) + G.rel(s, k, d) - 100) / 500;
    const A = s.airlines[k];
    if (A.pers) m *= G.PERSONALITIES[A.pers].appeal || 1;
    m *= G.satAppeal(A) * legs.reduce((v, r) => v * G.SERVICE[r.svc ?? 1].appeal, 1) ** (1 / legs.length);
    for (const j of G.partners(s, k)) if (s.airlines[j].hubs.includes(o) || s.airlines[j].hubs.includes(d)) { m *= 1.1; break; }
    return m;
  }

  // Returns per-route results and per-airline passenger totals by region (quarterly).
  G.runNetwork = function (s, routes = s.routes) {
    const adj = s.airlines.map(() => new Map());
    const served = new Set();
    for (const r of routes) {
      const m = adj[r.o];
      if (!m.has(r.a)) m.set(r.a, new Map());
      if (!m.has(r.b)) m.set(r.b, new Map());
      m.get(r.a).set(r.b, r); m.get(r.b).set(r.a, r);
      served.add(r.a); served.add(r.b);
    }
    const cities = [...served];
    const cm = { appeal: s.airlines.map(() => ({})) };
    for (const c of cities) {
      cm[c] = G.cityMult(s, c);
      s.airlines.forEach((A, k) => (cm.appeal[k][c] = G.appealAt(s, k, c)));
    }
    const R = new Map();
    for (const r of routes) R.set(r.id, { r, want: 0, pax: 0, rev: 0, local: 0, conn: 0, cap: PLANE[r.type].seats * r.freq * G.MAX_LF });
    const ods = [];
    for (let x = 0; x < cities.length; x++) for (let y = x + 1; y < cities.length; y++) {
      const o = cities[x], d = cities[y], dOD = G.dist(o, d);
      if (dOD < 150) continue;
      const D = G.baseDemand(s, o, d, cm);
      if (D < 4) continue;
      const opts = [];
      s.airlines.forEach((A, k) => {
        if (A.bankrupt) return;
        const m = adj[k];
        const direct = m.get(o) && m.get(o).get(d);
        if (direct) {
          opts.push({ k, legs: [direct], ff: 1 + direct.fare / 100, freq: direct.freq, attr: 0, conn: false });
          return;
        }
        let best = null;
        for (const h of A.hubs) {
          if (h === o || h === d || !m.get(h)) continue;
          const r1 = m.get(o) && m.get(o).get(h), r2 = m.get(h).get(d);
          if (!r1 || !r2) continue;
          const circ = (G.dist(o, h) + G.dist(h, d)) / dOD;
          if (circ > 1.7) continue;
          const ff = (2 + (r1.fare + r2.fare) / 100) / 2 * 0.92;
          const freq = Math.min(r1.freq, r2.freq) * 0.6;
          const score = Math.pow(freq, 0.75) * Math.pow(ff, -2.5) * 0.5 / Math.pow(circ, 1.5);
          if (!best || score > best.score) best = { k, legs: [r1, r2], ff, freq, circ, score, conn: true };
        }
        if (best) opts.push(best);
      });
      if (!opts.length) continue;
      let sumA = 0, sumFF = 0, freqTot = 0;
      for (const p of opts) {
        p.attr = Math.pow(p.freq, 0.75) * Math.pow(p.ff, -2.5) * appeal(s, p.k, o, d, p.legs, cm) *
          (p.conn ? 0.5 / Math.pow(p.circ, 1.5) : 1);
        sumA += p.attr; sumFF += p.ff * p.attr; freqTot += p.freq;
      }
      if (!sumA) continue;
      const avgFF = sumFF / sumA;
      const total = D * Math.pow(avgFF, avgFF > 1 ? -2.6 : -1.3) * Math.min(1, Math.sqrt(freqTot / 10));
      for (const p of opts) {
        p.want = total * p.attr / sumA;
        for (const l of p.legs) R.get(l.id).want += p.want;
      }
      ods.push({ o, d, dOD, D, total, opts });
    }
    for (const x of R.values()) x.ratio = x.want > x.cap ? x.cap / x.want : 1;
    const regionPax = s.airlines.map(() => ({}));
    const paxTotal = s.airlines.map(() => 0);
    for (const od of ods) {
      const fare = G.baseFare(s, od.dOD);
      for (const p of od.opts) {
        const carried = p.want * Math.min(...p.legs.map(l => R.get(l.id).ratio));
        p.carried = carried;
        const legDist = p.legs.reduce((t, l) => t + G.dist(l.a, l.b), 0);
        const ticket = fare * p.ff * (p.conn ? 0.9 : 1);
        for (const l of p.legs) {
          const x = R.get(l.id);
          x.pax += carried;
          x.rev += carried * ticket * (G.dist(l.a, l.b) / legDist);
          if (p.conn) x.conn += carried; else x.local += carried;
        }
        const q = carried * 2 * G.WEEKS, ro = CITY[od.o].region, rd = CITY[od.d].region;
        regionPax[p.k][ro] = (regionPax[p.k][ro] || 0) + q;
        if (rd !== ro) regionPax[p.k][rd] = (regionPax[p.k][rd] || 0) + q;
        paxTotal[p.k] += q;
      }
    }
    // Quarterly economics per route.
    const cmult = s.airlines.map((A, i) => G.costMultFor(s, i));
    for (const x of R.values()) {
      const r = x.r, A = s.airlines[r.o], P = PLANE[r.type], d = G.dist(r.a, r.b);
      const cut = 1 - Math.min(0.12, G.costCutAt(s, r.o, r.a) + G.costCutAt(s, r.o, r.b));
      x.revQ = x.rev * 2 * G.WEEKS / 1e6;
      const pm = A.pers ? (G.PERSONALITIES[A.pers].cost || 1) : 1;
      x.costQ = r.freq * G.rtHours(r.type, d) * G.WEEKS * P.hourly * 0.8 / 1000 * cmult[r.o] * G.maintMult(s, A, r.type) * cut * pm * G.SERVICE[r.svc ?? 1].cost;
      x.lf = x.pax / (P.seats * r.freq);
      x.spill = Math.max(0, x.want - x.pax);
    }
    return { R, ods, regionPax, paxTotal };
  };

  G.routeResult = x => ({
    pax: Math.round(x.pax * 2 * G.WEEKS), local: Math.round(x.local * 2 * G.WEEKS), conn: Math.round(x.conn * 2 * G.WEEKS),
    lf: x.lf, rev: x.revQ, cost: x.costQ, profit: x.revQ - x.costQ, spill: Math.round(x.spill * 2 * G.WEEKS),
  });

  // What-if: run the network with a route added or changed and report it plus the knock-on effect on the rest of your network.
  G.previewRoute = function (s, i, spec, exceptId) {
    const base = G.runNetwork(s);
    const tmp = { id: -1, o: i, ...spec };
    const alt = G.runNetwork(s, [...s.routes.filter(r => r.id !== exceptId), tmp]);
    const me = alt.R.get(-1);
    const others = (net, skip) => [...net.R.values()].filter(x => x.r.o === i && x.r.id !== skip && x.r.id !== -1)
      .reduce((t, x) => t + x.revQ - x.costQ, 0);
    const knock = others(alt, exceptId) - others(base, exceptId);
    const P = PLANE[spec.type];
    const own = spec.planes * P.price * G.OWN_RATE;
    const slotFee = spec.freq * (G.slotFee(s, spec.a) + G.slotFee(s, spec.b));
    const res = G.routeResult(me);
    return {
      demand: Math.round(G.baseDemand(s, spec.a, spec.b)), paxWeek: Math.round(me.pax), localWeek: Math.round(me.local), connWeek: Math.round(me.conn),
      rivals: s.routes.filter(r => r.o !== i && r.id !== exceptId && G.pairKey(r.a, r.b) === G.pairKey(spec.a, spec.b)).length,
      ...res, own: own + slotFee, net: res.profit - own - slotFee, knock,
    };
  };
})(globalThis.G);
