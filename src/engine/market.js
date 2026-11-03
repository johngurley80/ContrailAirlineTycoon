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
    m *= G.satAppeal(A);
    for (const j of G.partners(s, k)) if (s.airlines[j].hubs.includes(o) || s.airlines[j].hubs.includes(d)) { m *= 1.1; break; }
    return m;
  }
  const svcAppeal = legs => legs.reduce((v, r) => v * G.SERVICE[r.svc ?? 1].appeal, 1) ** (1 / legs.length);

  // Two kinds of traveller. Business travellers care about frequency and service and shrug at fares;
  // leisure travellers chase the cheapest seat. fp/fq/sp: weight of price, frequency and service when
  // choosing an airline; el/fr: how much fares and thin schedules shrink the whole market.
  G.SEGMENTS = [
    { id: 'biz', name: 'Business', fp: 1.5, fq: 1.0, sp: 2.5, el: 1.4, fr: 0.7 },
    { id: 'lei', name: 'Leisure', fp: 2.9, fq: 0.6, sp: 0.4, el: 3.0, fr: 0.35 },
  ];
  G.bizShare = function (s, a, b) {
    const econ = (G.cityStats(s, a).econ + G.cityStats(s, b).econ) / 2, tour = (CITY[a].tour + CITY[b].tour) / 2;
    let x = 0.12 + econ * 0.035 - tour * 0.012;
    if (s.events.some(e => e.biz)) x *= 0.7;
    return G.clamp(x, 0.08, 0.5);
  };

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
    for (const r of routes) R.set(r.id, { r, want: 0, wantB: 0, pax: 0, biz: 0, rev: 0, local: 0, conn: 0, cap: PLANE[r.type].seats * r.freq * G.MAX_LF, mkt: {} });
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
      const freqTot = opts.reduce((t, p) => t + p.freq, 0), bs = G.bizShare(s, o, d);
      for (const p of opts) {
        p.base = appeal(s, p.k, o, d, p.legs, cm) * (p.conn ? 0.5 / Math.pow(p.circ, 1.5) : 1);
        p.sv = svcAppeal(p.legs); p.want = 0; p.wantB = 0;
      }
      let total = 0, priceLoss = 0, freqLoss = 0;
      for (const sg of G.SEGMENTS) {
        const Dg = D * (sg.id === 'biz' ? bs : 1 - bs);
        let sumA = 0, sumFF = 0;
        for (const p of opts) {
          p.a = Math.pow(p.freq, sg.fq) * Math.pow(p.ff, -sg.fp) * Math.pow(p.sv, sg.sp) * p.base;
          sumA += p.a; sumFF += p.ff * p.a;
        }
        if (!sumA) continue;
        const avgFF = sumFF / sumA;
        const pf = Math.pow(avgFF, avgFF > 1 ? -sg.el : -sg.el / 2), qf = Math.min(1, Math.pow(freqTot / 10, sg.fr));
        const t = Dg * pf * qf;
        total += t; priceLoss += Dg * (1 - pf); freqLoss += Dg * pf * (1 - qf);
        for (const p of opts) {
          const w = t * p.a / sumA;
          p.want += w;
          if (sg.id === 'biz') p.wantB += w;
        }
      }
      for (const p of opts) {
        for (const l of p.legs) { const x = R.get(l.id); x.want += p.want; x.wantB += p.wantB; }
        // the market behind a nonstop: how many could fly it, and where the rest went
        if (!p.conn) Object.assign(R.get(p.legs[0].id).mkt, { D, priceLoss, freqLoss, rivals: total - p.want, mine: p.want });
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
        const bizCarried = p.want ? carried * p.wantB / p.want : 0;
        const legDist = p.legs.reduce((t, l) => t + G.dist(l.a, l.b), 0);
        const ticket = fare * p.ff * (p.conn ? 0.9 : 1);
        for (const l of p.legs) {
          const x = R.get(l.id);
          x.pax += carried; x.biz += bizCarried;
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
      // spill: turned away because this flight was full; blocked: wanted to connect but another leg was full
      x.spill = Math.max(0, x.want - x.cap);
      x.blocked = Math.max(0, x.want - x.pax - x.spill);
    }
    return { R, ods, regionPax, paxTotal };
  };

  const perQ = v => Math.round((v || 0) * 2 * G.WEEKS);
  G.routeResult = x => ({
    pax: perQ(x.pax), local: perQ(x.local), conn: perQ(x.conn), biz: perQ(x.biz),
    lf: x.lf, rev: x.revQ, cost: x.costQ, profit: x.revQ - x.costQ, spill: perQ(x.spill), blocked: perQ(x.blocked),
    mkt: x.mkt.D ? { D: perQ(x.mkt.D), price: perQ(x.mkt.priceLoss), freq: perQ(x.mkt.freqLoss), rivals: perQ(x.mkt.rivals), mine: perQ(x.mkt.mine) } : null,
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
