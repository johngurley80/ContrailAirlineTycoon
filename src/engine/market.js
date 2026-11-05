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
    const cm = { appeal: s.airlines.map(() => ({})), y: {}, f: {} };
    for (const c of cities) {
      cm[c] = G.cityMult(s, c);
      cm.y[c] = G.crisisYield(s, c);
      cm.f[c] = G.fearAt(s, c);
      s.airlines.forEach((A, k) => (cm.appeal[k][c] = G.appealAt(s, k, c)));
    }
    const R = new Map();
    for (const r of routes) R.set(r.id, { r, want: 0, wantB: 0, pax: 0, biz: 0, rev: 0, local: 0, conn: 0, spill: 0, blocked: 0, inter: 0, cap: G.seatsOn(r) * r.freq * G.MAX_LF, mkt: {} });
    // codeshare partners: travellers may connect between your flights and theirs
    const allies = s.airlines.map((A, k) => G.partners(s, k));
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
        const tryVia = (h, m1, m2, inter) => {
          if (h === o || h === d || !m1.get(h) || !m2.get(h)) return;
          const r1 = m1.get(o) && m1.get(o).get(h), r2 = m2.get(h).get(d);
          if (!r1 || !r2) return;
          const circ = (G.dist(o, h) + G.dist(h, d)) / dOD;
          if (circ > 1.7) return;
          const ff = (2 + (r1.fare + r2.fare) / 100) / 2 * (inter ? 0.95 : 0.92);
          const freq = Math.min(r1.freq, r2.freq) * (inter ? 0.5 : 0.6);
          const score = Math.pow(freq, 0.75) * Math.pow(ff, -2.5) * 0.5 / Math.pow(circ, 1.5);
          if (!best || score > best.score) best = { k, legs: [r1, r2], ff, freq, circ, score, conn: true, inter };
        };
        for (const h of A.hubs) tryVia(h, m, m, false);
        for (const j of allies[k]) {
          if (s.airlines[j].bankrupt) continue;
          for (const h of new Set([...A.hubs, ...s.airlines[j].hubs])) { tryVia(h, m, adj[j], true); tryVia(h, adj[j], m, true); }
        }
        if (best) opts.push(best);
      });
      if (!opts.length) continue;
      const freqTot = opts.reduce((t, p) => t + p.freq, 0), bs = G.bizShare(s, o, d);
      for (const p of opts) {
        p.base = appeal(s, p.k, o, d, p.legs, cm) * (p.conn ? 0.5 / Math.pow(p.circ, 1.5) : 1);
        p.sv = svcAppeal(p.legs); p.want = 0; p.wantB = 0;
        p.cab = p.legs.reduce((t, r) => t + G.CABINS[r.cab || 0].share, 0) / p.legs.length;
        p.pk = p.legs.filter(r => r.peak).length / p.legs.length;
        // value for money: travellers judge a fare against what they get. Basic service and an airline
        // with a poor reputation make a fare feel higher; good service makes it feel fairer.
        const sat = s.airlines[p.k].sat ?? 50;
        p.q = G.clamp(p.sv * (0.8 + sat * 0.004), 0.6, 1.15);
        p.vf = p.ff / p.q;
      }
      let total = 0, priceLoss = 0, freqLoss = 0;
      for (const sg of G.SEGMENTS) {
        const Dg = D * (sg.id === 'biz' ? bs : 1 - bs);
        let sumA = 0, sumFF = 0, sumVF = 0;
        for (const p of opts) {
          p.a = Math.pow(p.freq, sg.fq) * Math.pow(p.ff, -sg.fp) * Math.pow(p.sv, sg.sp) * p.base *
            (sg.id === 'biz' ? (1 + 3 * p.cab) * (1 + 0.25 * p.pk) : 1 + 0.05 * p.pk);
          sumA += p.a; sumFF += p.ff * p.a; sumVF += p.vf * p.a;
        }
        if (!sumA) continue;
        // how many travel at all depends on the price as they perceive it
        const avgFF = sumVF / sumA;
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
    // Seats are shared out in proportion to demand. A seat left empty because its traveller's other flight
    // was full is offered again, so a flight only counts as full when it really is.
    for (const x of R.values()) x.ratio = x.want > x.cap ? x.cap / x.want : 1;
    const paths = ods.flatMap(od => od.opts);
    for (let it = 0; it < 5; it++) {
      for (const x of R.values()) x.load = 0;
      for (const p of paths) { const c = p.want * Math.min(...p.legs.map(l => R.get(l.id).ratio)); for (const l of p.legs) R.get(l.id).load += c; }
      let moved = false;
      for (const x of R.values()) if (x.ratio < 1 && x.load < x.cap * 0.995) { x.ratio = Math.min(1, x.ratio * x.cap / Math.max(1e-9, x.load)); moved = true; }
      if (!moved) break;
    }
    // Hard capacity check: re-offering empty seats can leave a flight slightly overbooked, so any leg
    // still over its seats scales down every journey that uses it. Scaling only ever lowers loads, so
    // one pass leaves every flight within its seats.
    const onLeg = new Map();
    for (const p of paths) {
      p.seated = p.want * Math.min(...p.legs.map(l => R.get(l.id).ratio));
      for (const l of p.legs) { if (!onLeg.has(l.id)) onLeg.set(l.id, []); onLeg.get(l.id).push(p); }
    }
    for (const [id, ps] of onLeg) {
      const x = R.get(id), load = ps.reduce((t, p) => t + p.seated, 0);
      if (load > x.cap) { const k = x.cap / load; for (const p of ps) p.seated *= k; }
    }
    const regionPax = s.airlines.map(() => ({}));
    const paxTotal = s.airlines.map(() => 0), connJourneys = s.airlines.map(() => 0);
    for (const od of ods) {
      const fare = G.baseFare(s, od.dOD);
      for (const p of od.opts) {
        const ratios = p.legs.map(l => R.get(l.id).ratio), low = Math.min(...ratios);
        const fear = Math.sqrt(cm.f[od.o] * cm.f[od.d]);
        const seated = p.seated, lost = p.want - seated, carried = seated * fear;
        p.carried = carried;
        // a lost traveller counts against the flight that was full, and as "blocked" on the other leg
        p.legs.forEach((l, n) => { const x = R.get(l.id); if (ratios[n] <= low + 1e-9) x.spill += lost; else x.blocked += lost; });
        const bizCarried = p.want ? carried * p.wantB / p.want : 0;
        const legDist = p.legs.reduce((t, l) => t + G.dist(l.a, l.b), 0);
        // a poor product sells more of its seats at discount: the average ticket falls with value for money
        const ticket = fare * p.ff * Math.pow(Math.min(1.03, p.q), 0.6) * (p.conn ? 0.9 : 1) * Math.sqrt(cm.y[od.o] * cm.y[od.d]) * (1 + 0.05 * p.pk);
        for (const l of p.legs) {
          const x = R.get(l.id);
          x.pax += carried; x.biz += bizCarried;
          x.rev += carried * ticket * (G.dist(l.a, l.b) / legDist);
          if (p.conn) x.conn += carried; else x.local += carried;
          if (p.inter) x.inter += carried;
        }
        if (p.conn) connJourneys[p.k] += carried * 2 * G.WEEKS;
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
      // business-cabin premium: business travellers seated up front pay 2.5x the fare
      const front = Math.min(x.biz, G.bizSeatsOn(r) * r.freq);
      x.prem = x.pax ? front * (x.rev / x.pax) * 1.5 : 0;
      x.rev += x.prem;
      x.revQ = x.rev * 2 * G.WEEKS / 1e6;
      x.cargoQ = G.bellyCargo(s, r);
      x.revQ += x.cargoQ;
      const pm = A.pers ? (G.PERSONALITIES[A.pers].cost || 1) : 1;
      x.costQ = r.freq * G.rtHours(r.type, d) * G.WEEKS * P.hourly * 0.8 / 1000 * cmult[r.o] * G.maintMult(s, A, r.type) * cut * pm * G.SERVICE[r.svc ?? 1].cost;
      x.lf = x.pax / (G.seatsOn(r) * r.freq);
    }
    return { R, ods, regionPax, paxTotal, connJourneys };
  };

  const perQ = v => Math.round((v || 0) * 2 * G.WEEKS);
  G.routeResult = x => ({
    pax: perQ(x.pax), local: perQ(x.local), conn: perQ(x.conn), biz: perQ(x.biz),
    lf: x.lf, rev: x.revQ, cost: x.costQ, profit: x.revQ - x.costQ, spill: perQ(x.spill), blocked: perQ(x.blocked),
    cargo: x.cargoQ || 0, prem: (x.prem || 0) * 2 * G.WEEKS / 1e6, inter: perQ(x.inter),
    mkt: x.mkt.D ? { D: perQ(x.mkt.D), price: perQ(x.mkt.priceLoss), freq: perQ(x.mkt.freqLoss), rivals: perQ(x.mkt.rivals), mine: perQ(x.mkt.mine) } : null,
  });

  // What-if: run the network with a route added or changed and report it plus the knock-on effect on the rest of your network.
  G.previewRoute = function (s, i, spec, exceptId, base = G.runNetwork(s)) {
    const tmp = { ...spec, id: -1, o: i };
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
      ...res, own: own + slotFee, aircraft: own, slotFee, net: res.profit - own - slotFee, knock,
    };
  };
})(globalThis.G);
