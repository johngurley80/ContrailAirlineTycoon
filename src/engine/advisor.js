// The quarterly board meeting: advisors read the last quarter and point at what needs attention.
(function (G) {
  'use strict';
  const { CITY, REGIONS, REGION, PLANE } = G;
  const nf = n => Math.round(n).toLocaleString('en-US');

  // What can actually be done about a full route: only offers moves that are open right now.
  G.fullFix = function (s, r) {
    const i = r.o ?? 0, d = G.dist(r.a, r.b), opts = [];
    const room = Math.min(G.slotsAvail(s, i, r.a, r.id ?? undefined), G.slotsAvail(s, i, r.b, r.id ?? undefined)) - r.freq;
    const spareHours = (r.planes || 0) * G.HOURS_PER_PLANE - r.freq * G.rtHours(r.type, d);
    if (room > 0) opts.push(spareHours >= G.rtHours(r.type, d) || G.idle(s, i, r.type) > 0 ? 'add flights' : 'add flights (with another aircraft)');
    const bigger = G.fleetTypes(s.airlines[i]).some(t => PLANE[t].range >= d && PLANE[t].seats > PLANE[r.type].seats && G.idle(s, i, t) > 0)
      || G.buyableTypes(s, i).some(p => p.range >= d && p.seats > PLANE[r.type].seats);
    if (bigger) opts.push('use bigger aircraft');
    if ((r.cab || 0) > 0) opts.push('fit more economy seats');
    if (r.fare < 50) opts.push('raise the fare');
    if (room <= 0) opts.push(`win more slots at ${G.slotsAvail(s, i, r.a, r.id ?? undefined) <= G.slotsAvail(s, i, r.b, r.id ?? undefined) ? r.a : r.b}`);
    if (!opts.length) return 'Every seat is sold at the highest fare allowed: this route is as good as it gets.';
    const t = opts.length > 1 ? opts.slice(0, -1).join(', ') + ' or ' + opts[opts.length - 1] : opts[0];
    return t.charAt(0).toUpperCase() + t.slice(1) + '.';
  };

  // ---------- ranked decisions ----------
  // Concrete, priced moves instead of repeated warnings. Each is measured as the change in company
  // profit a quarter: route results plus the knock-on effect on the rest of the network, less new slot
  // fees and the ownership cost of any aircraft that would have to be bought. Aircraft you already own
  // cost the same flying or idle, so they are not charged again.
  const specOf = r => ({ a: r.a, b: r.b, type: r.type, planes: r.planes, freq: r.freq, fare: r.fare, svc: r.svc ?? 1, cab: r.cab || 0, peak: !!r.peak });
  G.changeOptions = function (s, r, kind) {
    const i = r.o, d = G.dist(r.a, r.b), id = r.id, spec0 = specOf(r);
    const cur = G.previewRoute(s, i, spec0, id), v0 = cur.profit - cur.slotFee;
    const out = [];
    const test = (spec, label) => {
      const pv = G.previewRoute(s, i, spec, id);
      const free = G.idle(s, i, spec.type) + (spec.type === r.type ? r.planes : 0);
      const buy = Math.max(0, spec.planes - free);
      const slots = [...new Set([spec.a, spec.b])].map(c => ({ c, n: Math.max(0, spec.freq - G.slotsAvail(s, i, c, id)) })).filter(x => x.n > 0);
      const gain = pv.profit - pv.slotFee + pv.knock - v0 - buy * PLANE[spec.type].price * G.OWN_RATE;
      out.push({ spec, label, gain, buy, slots, cash: buy * G.planePrice(s, i, spec.type), dPax: pv.pax - cur.pax, now: !buy && !slots.length });
    };
    // a low-cost objective needs fares at least 10% below standard: never advise raising past that
    const fareMax = s.goal === 'lowcost' ? -10 : 50;
    const planesFor = (t, f) => Math.max(1, Math.ceil(f * G.rtHours(t, d) / G.HOURS_PER_PLANE));
    if (kind === 'grow') {
      for (const k of [2, 4, 7]) {
        const freq = Math.min(28, r.freq + k), planes = Math.max(r.planes, planesFor(r.type, freq));
        test({ ...spec0, freq, planes }, `fly ${freq} a week${planes > r.planes ? ` with ${planes - r.planes} more aircraft` : ''}`);
      }
      // bigger aircraft: any you have sitting idle, plus the two smallest steps up you could buy
      const big = t => PLANE[t].range >= d && PLANE[t].seats > PLANE[r.type].seats * 1.15;
      const idleBig = G.fleetTypes(s.airlines[i]).filter(t => big(t) && G.idle(s, i, t) > 0);
      const bigger = [...new Set([...idleBig, ...G.buyableTypes(s, i).map(p => p.id).filter(big).sort((x, y) => PLANE[x].seats - PLANE[y].seats).slice(0, 2)])];
      for (const t of bigger) test({ ...spec0, type: t, planes: planesFor(t, r.freq) }, `switch to the ${PLANE[t].name}`);
      for (const f of [10, 20]) if (r.fare + f <= fareMax) test({ ...spec0, fare: r.fare + f }, `raise the fare to ${r.fare + f >= 0 ? '+' : ''}${r.fare + f}%`);
    } else {
      for (const f of [-10, -20]) if (r.fare + f >= -50) test({ ...spec0, fare: r.fare + f }, `cut the fare to ${r.fare + f >= 0 ? '+' : ''}${r.fare + f}%`);
      if (r.freq > 2) { const freq = Math.max(1, Math.round(r.freq * 0.6)); test({ ...spec0, freq, planes: Math.min(r.planes, planesFor(r.type, freq)) }, `trim to ${freq} a week`); }
      if ((r.svc ?? 1) > 0) test({ ...spec0, svc: (r.svc ?? 1) - 1 }, `drop to ${G.SERVICE[(r.svc ?? 1) - 1].name.toLowerCase()} service`);
    }
    return out.filter(o => o.gain > 0.05).sort((x, y) => y.gain - x.gain);
  };
  G.decisions = function (s) {
    const A = s.airlines[0], focus = A.focus || 'profit', out = [];
    const score = o => o.gain + (focus === 'share' ? Math.max(0, o.dPax || 0) * 2e-5 * Math.max(0.3, G.eraScale(s)) : 0);
    const mine = G.routesOf(s, 0).filter(r => r.last);
    const full = mine.filter(r => r.last.spill > Math.max(400, r.last.pax * 0.05)).sort((x, y) => y.last.spill - x.last.spill).slice(0, 4);
    for (const r of full) {
      const opts = G.changeOptions(s, r, 'grow');
      if (!opts.length) continue;
      const best = opts[0], now = opts.find(o => o.now);
      out.push({ key: `grow-${r.id}`, route: r.id, why: `${r.a}–${r.b} turned away ${nf(r.last.spill)} passengers`, best, alt: now && now !== best ? now : null });
    }
    for (const r of mine.filter(r => r.last.profit < 0 && r.age >= 2).sort((x, y) => x.last.profit - y.last.profit).slice(0, 2)) {
      const opts = G.changeOptions(s, r, 'fix');
      out.push({ key: `fix-${r.id}`, route: r.id, why: `${r.a}–${r.b} lost ${G.fmtM(-r.last.profit)} before aircraft costs`, best: opts[0] || null, close: !opts.length });
    }
    // surplus aircraft: the best market each idle type can fly now (longest-range types pick first)
    const taken = new Set(), allOpps = G.opportunities(s, 0, 999).filter(o => o.slots >= 2);
    for (const surplus of G.fleetTypes(A).filter(t => G.surplus(s, 0, t) > 0).sort((x, y) => PLANE[y].range - PLANE[x].range).slice(0, 2)) {
      const o = allOpps.find(o => PLANE[surplus].range >= o.d && !taken.has(G.pairKey(o.a, o.b)));
      if (o) {
        taken.add(G.pairKey(o.a, o.b));
        const sch = G.suggestSchedule(s, 0, { a: o.a, b: o.b, type: surplus }, { maxPlanes: G.surplus(s, 0, surplus), quick: true });
        if (sch) out.push({ key: `idle-${surplus}`, why: `${G.surplus(s, 0, surplus)} × ${PLANE[surplus].name} idle`, plan: { a: o.a, b: o.b }, best: { label: `fly ${o.a}–${o.b} ${sch.freq} a week with ${sch.planes} of them`, spec: { a: o.a, b: o.b, type: surplus, planes: sch.planes, freq: sch.freq }, gain: sch.pv.profit - sch.pv.slotFee + sch.pv.knock, buy: 0, slots: [], now: true, dPax: sch.pv.pax } });
      }
    }
    // a market you already hold slots for but have no spare aircraft to fly: price buying them
    if (!out.some(x => x.plan)) {
      for (const o of G.opportunities(s, 0, 999).filter(o => o.slots >= 2).slice(0, 3)) {
        let pick = null;
        // aircraft already sitting idle (reserves included) come first; then the cheapest seats to buy
        const owned = G.fleetTypes(A).filter(t => G.idle(s, 0, t) > 0 && PLANE[t].range >= o.d).map(t => PLANE[t]);
        const types = [...owned, ...G.buyableTypes(s, 0).filter(P => P.range >= o.d && !owned.includes(P)).sort((x, y) => x.price / x.seats - y.price / y.seats).slice(0, 3)];
        for (const P of types) {
          const have = G.idle(s, 0, P.id);
          const sch = G.suggestSchedule(s, 0, { a: o.a, b: o.b, type: P.id }, { maxPlanes: Math.max(3, have), owned: have, quick: true });
          if (!sch) continue;
          const spec = { a: o.a, b: o.b, type: P.id, planes: sch.planes, freq: Math.min(sch.freq, o.slots), fare: s.goal === 'lowcost' ? -15 : 0, svc: 1, cab: 0, peak: false };
          const pv = G.previewRoute(s, 0, spec), buy = Math.max(0, spec.planes - have);
          const gain = pv.profit - pv.slotFee + pv.knock - buy * P.price * G.OWN_RATE;
          const label = buy ? `fly ${o.a}–${o.b} ${spec.freq} a week with ${buy} new ${P.name}${buy > 1 ? 's' : ''}${spec.planes > buy ? ` and ${spec.planes - buy} you have` : ''}` : `fly ${o.a}–${o.b} ${spec.freq} a week with ${spec.planes} of your idle ${P.name}${spec.planes > 1 ? 's' : ''}`;
          if (gain > 0.5 && (!pick || gain > pick.gain)) pick = { label, spec, gain, buy, slots: [], cash: buy * G.planePrice(s, 0, P.id), dPax: pv.pax, now: !buy };
        }
        if (pick && A.cash > pick.cash * 0.5) { out.push({ key: `new-${o.a}-${o.b}`, why: `${o.a}–${o.b} is unserved and you hold slots at both ends`, plan: { a: o.a, b: o.b }, best: pick }); break; }
      }
    }
    for (const p of A.planned || []) {
      const st = G.plannedStatus(s, 0, p);
      if (st.ready && st.pv) out.push({ key: `ready-${st.a}-${st.b}`, why: `Planned ${st.a}–${st.b} is ready`, plan: { a: st.a, b: st.b }, best: { label: `open it at ${st.freq} a week`, spec: { a: st.a, b: st.b, type: st.type, planes: st.need, freq: st.freq }, gain: st.pv.profit - st.pv.slotFee + st.pv.knock, buy: 0, slots: [], now: true, dPax: st.pv.pax } });
    }
    // slots at a full airport that no rival will sell can only come from your own weaker routes there:
    // name the route to trim and charge what it earns on those slots; drop the move if there is none
    for (const x of out) {
      const b = x.best;
      if (!b || !b.slots || !b.slots.length) continue;
      for (const z of b.slots) {
        if (G.airportFree(s, z.c) > 0 || G.slotOffers(s, 0, z.c).reduce((t, o) => t + o.n, 0) >= z.n) continue;
        // what trimming each candidate really costs, connecting passengers it feeds included
        const donor = mine.filter(r => r.id !== x.route && (r.a === z.c || r.b === z.c) && r.freq > z.n).map(r => {
          const now = G.previewRoute(s, 0, specOf(r), r.id), cut = G.previewRoute(s, 0, { ...specOf(r), freq: r.freq - z.n }, r.id);
          return { r, loss: Math.max(0, (now.profit - now.slotFee) - (cut.profit - cut.slotFee + cut.knock)) };
        }).sort((p, q) => p.loss - q.loss)[0];
        if (!donor || donor.loss >= b.gain) { x.best = null; break; }
        const loss = donor.loss;
        b.gain -= loss;
        b.trims = (b.trims || []).concat({ c: z.c, n: z.n, id: donor.r.id, a: donor.r.a, b: donor.r.b, to: donor.r.freq - z.n, loss });
        z.trim = true;
      }
    }
    // investment quality: what it costs up front, how fast it pays back and what it adds by the deadline
    const ctx = G.objectiveContext(s), byDeadline = !!s.scenario || ctx.cashCounts;
    for (const x of out) {
      const b = x.best;
      if (!b) continue;
      b.kind = b.buy || x.plan || (b.spec && (b.spec.freq > (s.routes.find(r => r.id === x.route) || {}).freq || b.spec.type !== (s.routes.find(r => r.id === x.route) || {}).type)) ? 'expand' : 'adjust';
      // everything the move needs in cash: aircraft bought outright plus slot-talk deposits (not refunded)
      b.planeCash = b.cash || 0;
      b.slotCash = (b.slots || []).filter(z => !z.trim).reduce((t, z) => t + G.slotPrice(s, z.c) * ([5, 10, 20].find(v => v >= z.n) || 20), 0);
      b.cash = b.planeCash + b.slotCash;
      b.payback = b.cash > 0 ? (b.gain > 0 ? b.cash / (b.gain + b.buy * PLANE[b.spec.type].price * G.OWN_RATE) : Infinity) : 0;
      // aircraft arrive and slot talks finish at the end of the quarter, so those moves earn a quarter later;
      // a new aircraft counts in company value at 70% of its price, and slot deposits are not assets at all
      b.lag = b.buy || (b.slots && b.slots.length) ? 1 : 0;
      b.lost = (b.buy ? b.planeCash - b.buy * G.planeValue(s, b.spec.type, 0) : 0) + b.slotCash;
      b.byEnd = G.valueByDeadline(s, b.gain, byDeadline ? b.lost : 0, b.lag);
      if (x.alt) x.alt.byEnd = G.valueByDeadline(s, x.alt.gain);
    }
    // near the finish, drop moves that cannot add value before the clock runs out
    if (byDeadline) {
      for (const x of out) if (x.best && x.best.byEnd <= 0) { if (x.alt && x.alt.byEnd > 0) { x.best = { ...x.alt, kind: 'adjust', cash: 0, planeCash: 0, slotCash: 0, payback: 0, lag: 0, lost: 0 }; x.alt = null; } else x.best = null; }
      if (ctx.left <= 0) return [];
    }
    // objectives won on passengers count passengers gained where they are still needed
    const g = ctx.obj === 'world' || ctx.obj === 'regional' || ctx.obj === 'lowcost' ? G.goalStatus(s, 0) : null;
    const homeR = CITY[A.home].region;
    const needR = !g ? [] : ctx.obj === 'lowcost' ? REGIONS.map(R => R.id) : ctx.obj === 'regional' ? [homeR] : REGIONS.map(R => R.id).filter(r => !g.leads.includes(r));
    const w = 2e-5 * Math.max(0.3, G.eraScale(s));
    for (const x of out) {
      if (!x.best || !needR.length) continue;
      const r = x.route != null ? s.routes.find(z => z.id === x.route) : null, ends = r ? [r.a, r.b] : x.plan ? [x.plan.a, x.plan.b] : [];
      const regs = [...new Set(ends.map(c => CITY[c].region))].filter(z => needR.includes(z));
      x.best.objBonus = regs.length ? Math.max(0, x.best.dPax || 0) * w : 0;
      x.best.objRegions = regs;
    }
    const rank = x => !x.best ? -1e9 : (byDeadline ? x.best.byEnd + score(x.best) - x.best.gain : score(x.best)) + (x.best.objBonus || 0);
    const list = out.filter(x => x.best || (x.close && !(byDeadline && ctx.left <= 1))).sort((x, y) => rank(y) - rank(x)).slice(0, 5);
    // moves are priced one at a time; flag a move whose free slots a higher-ranked move would use up
    const used = {}, usedPlanes = {}, usedTrims = {};
    for (const x of list) {
      const b = x.best;
      if (!b || !b.spec) continue;
      const r = x.route != null ? s.routes.find(z => z.id === x.route) : null;
      // a route trimmed to free slots for one move can't be trimmed again for free
      for (const t of b.trims || []) {
        if (usedTrims[t.id]) b.sharesTrim = { route: `${t.a}–${t.b}`, with: usedTrims[t.id] };
        else usedTrims[t.id] = `${b.spec.a}–${b.spec.b}`;
      }
      // the same idle aircraft can only fly one of the moves
      const t = b.spec.type, idle = G.idle(s, 0, t), take = Math.min(idle, Math.max(0, b.spec.planes - (r && r.type === t ? r.planes : 0) - (b.buy || 0)));
      if (take > 0) {
        if (usedPlanes[t] && usedPlanes[t].n + take > idle) b.sharesPlanes = { type: PLANE[t].name, with: usedPlanes[t].who };
        usedPlanes[t] = { n: (usedPlanes[t] ? usedPlanes[t].n : 0) + take, who: (usedPlanes[t] && usedPlanes[t].who) || `${b.spec.a}–${b.spec.b}` };
      }
      const extra = b.spec.freq - (r ? r.freq : 0);
      if (extra <= 0) continue;
      for (const c of [b.spec.a, b.spec.b]) {
        const free = G.slotsAvail(s, 0, c, r ? r.id : undefined) - (r ? r.freq : 0);
        if (used[c] && used[c].n + Math.min(extra, Math.max(0, free)) > free) b.shares = { c, with: used[c].who };
        used[c] = { n: (used[c] ? used[c].n : 0) + Math.min(extra, Math.max(0, free)), who: (used[c] && used[c].who) || `${b.spec.a}–${b.spec.b}` };
      }
    }
    return list;
  };

  G.advise = function (s, rep) {
    const A = s.airlines[0], cards = [];
    const add = (who, text, action, weight) => cards.push({ who, text, action, weight });
    const mine = G.routesOf(s, 0).filter(r => r.last);

    const full = mine.filter(r => r.last.spill > 2000).sort((x, y) => y.last.spill - x.last.spill)[0];
    if (full) add('ops', `${full.a}–${full.b} turned away about ${nf(full.last.spill)} passengers. ${G.fullFix(s, full)}`, { kind: 'route', id: full.id }, 9);
    const loser = mine.filter(r => r.losses >= 2 || (r.last.profit < -0.5 && r.age >= 2)).sort((x, y) => x.last.profit - y.last.profit)[0];
    if (loser) add('fin', `${loser.a}–${loser.b} lost ${G.fmtM(-loser.last.profit)} last quarter. Cut the fare, swap the aircraft or close it.`, { kind: 'route', id: loser.id }, 8);
    const idle = G.idleLastQuarter(s, 0);
    if (idle > 0) add('ops', `${idle} surplus aircraft sat idle last quarter, still costing ownership and upkeep. Put them on a route or sell them. (One spare per busy fleet is kept as a reserve against delays.)`, { kind: 'tab', tab: 'fleet' }, 7);
    if (A.cash < 0) add('fin', `We're overdrawn and paying 3% interest. Bankruptcy hits below ${G.fmtM(-G.creditLimit(s, 0))}.`, { kind: 'tab', tab: 'company' }, 10);
    else if (A.cash > 350 && idle === 0 && !A.orders.length && !G.objectiveContext(s).cashCounts) add('fin', `${G.fmtM(A.cash)} is sitting in the bank. Money that isn't flying isn't earning.`, { kind: 'tab', tab: 'fleet' }, 4);

    const tight = A.hubs.filter(h => G.slotsAvail(s, 0, h) < 4)[0];
    if (tight) add('gov', G.airportFree(s, tight) > 0
      ? `Only ${Math.max(0, G.slotsAvail(s, 0, tight))} free slots left at our ${CITY[tight].name} hub. Send a negotiator before rivals take them.`
      : `Only ${Math.max(0, G.slotsAvail(s, 0, tight))} free slots left at our ${CITY[tight].name} hub, and the airport is full. Buy spare slots from a rival there, or free some by trimming a weaker route.`, { kind: 'city', code: tight }, 7);

    const hubable = G.CITIES.find(c => !G.hubBlock(s, 0, c.code));
    if (hubable) add('strat', `We already fly to ${hubable.name}. A hub there would open all of ${REGION[hubable.region].name} to us.`, { kind: 'city', code: hubable.code }, 8);
    else {
      const missing = REGIONS.filter(R => !A.hubs.some(h => CITY[h].region === R.id));
      if (missing.length && G.objectiveContext(s).hubsMatter) {
        const R = missing[0];
        const target = G.CITIES.filter(c => c.region === R.id && c.major && !G.cityClosed(s, 0, c.code))
          .find(c => A.hubs.some(h => !G.routeBlock(s, 0, h, c.code)));
        if (target) add('strat', `We have no hub in ${R.name}. Fly to ${target.name} first, then build one there.`, { kind: 'city', code: target.code }, 5);
      }
    }

    const g = G.goalStatus(s, 0);
    const homeR = CITY[A.home].region;
    if (G.objectiveContext(s).homeLeadMatters && !g.leads.includes(homeR) && (A.yr.pax[homeR] || 0) > 0) add('strat', `A rival carries more passengers than us in ${REGION[homeR].name}, our home region. We must lead it to win.`, { kind: 'tab', tab: 'company' }, 6);

    const attackers = rep.rivals.filter(m => m.kind === 'attack' || m.kind === 'war');
    if (attackers.length) add('strat', `Rivals are moving on our routes. Matching their fares protects passengers but squeezes margins.`, { kind: 'tab', tab: 'routes' }, 6);

    const fresh = G.PLANES.filter(p => p.intro === s.year && G.canBuy(s, 0, p.id));
    if (s.q === 0 && fresh.length) add('ops', `New on the market this year: ${fresh.map(p => `${p.name} (${p.seats} seats, ${nf(p.range)} km)`).join(', ')}.`, { kind: 'tab', tab: 'fleet' }, 6);
    const old = G.fleetTypes(A).filter(t => G.avgAge(s, A, t) > 18);
    if (old.length) add('ops', `Our ${old.map(t => PLANE[t].name).join(', ')} fleet is over 18 years old. Upkeep keeps rising; think about replacing it.`, { kind: 'tab', tab: 'fleet' }, 3);
    const lowRel = Object.keys(A.slots).find(c => G.rel(s, 0, c) < 25);
    if (lowRel) add('gov', `${CITY[lowRel].name} officials are cooling on us (relations ${Math.round(G.rel(s, 0, lowRel))}). Slot talks there will be hard. Businesses and favors help.`, { kind: 'city', code: lowRel }, 4);

    return cards.sort((x, y) => y.weight - x.weight).slice(0, 4);
  };

  G.fmtM = function (m) {
    const a = Math.abs(m), sign = m < 0 ? '−' : '';
    return sign + '$' + (a >= 1000 ? (a / 1000).toFixed(2) + 'B' : a.toFixed(1) + 'M');
  };
})(globalThis.G);
