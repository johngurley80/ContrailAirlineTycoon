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
    const planesFor = (t, f) => Math.max(1, Math.ceil(f * G.rtHours(t, d) / G.HOURS_PER_PLANE));
    if (kind === 'grow') {
      for (const k of [2, 4, 7]) {
        const freq = Math.min(28, r.freq + k), planes = Math.max(r.planes, planesFor(r.type, freq));
        test({ ...spec0, freq, planes }, `fly ${freq} a week${planes > r.planes ? ` with ${planes - r.planes} more aircraft` : ''}`);
      }
      const bigger = [...new Set([...G.fleetTypes(s.airlines[i]), ...G.buyableTypes(s, i).map(p => p.id)])]
        .filter(t => PLANE[t].range >= d && PLANE[t].seats > PLANE[r.type].seats * 1.15).sort((x, y) => PLANE[x].seats - PLANE[y].seats).slice(0, 2);
      for (const t of bigger) test({ ...spec0, type: t, planes: planesFor(t, r.freq) }, `switch to the ${PLANE[t].name}`);
      for (const f of [10, 20]) if (r.fare + f <= 50) test({ ...spec0, fare: r.fare + f }, `raise the fare to ${r.fare + f >= 0 ? '+' : ''}${r.fare + f}%`);
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
    // surplus aircraft: the best market they can fly now
    const surplus = G.fleetTypes(A).filter(t => G.surplus(s, 0, t) > 0).sort((x, y) => PLANE[y].range - PLANE[x].range)[0];
    if (surplus) {
      const o = G.opportunities(s, 0, 12).find(o => o.slots >= 2 && PLANE[surplus].range >= o.d);
      if (o) {
        const sch = G.suggestSchedule(s, 0, { a: o.a, b: o.b, type: surplus }, { maxPlanes: G.surplus(s, 0, surplus), quick: true });
        if (sch) out.push({ key: `idle-${surplus}`, why: `${G.surplus(s, 0, surplus)} × ${PLANE[surplus].name} idle`, plan: { a: o.a, b: o.b }, best: { label: `fly ${o.a}–${o.b} ${sch.freq} a week with ${sch.planes} of them`, gain: sch.pv.profit - sch.pv.slotFee + sch.pv.knock, buy: 0, slots: [], now: true, dPax: sch.pv.pax } });
      }
    }
    for (const p of A.planned || []) {
      const st = G.plannedStatus(s, 0, p);
      if (st.ready && st.pv) out.push({ key: `ready-${st.a}-${st.b}`, why: `Planned ${st.a}–${st.b} is ready`, plan: { a: st.a, b: st.b }, best: { label: `open it at ${st.freq} a week`, gain: st.pv.profit - st.pv.slotFee + st.pv.knock, buy: 0, slots: [], now: true, dPax: st.pv.pax } });
    }
    return out.filter(x => x.best || x.close).sort((x, y) => (y.best ? score(y.best) : -1) - (x.best ? score(x.best) : -1)).slice(0, 5);
  };

  G.advise = function (s, rep) {
    const A = s.airlines[0], cards = [];
    const add = (who, text, action, weight) => cards.push({ who, text, action, weight });
    const mine = G.routesOf(s, 0).filter(r => r.last);

    const full = mine.filter(r => r.last.spill > 2000).sort((x, y) => y.last.spill - x.last.spill)[0];
    if (full) add('ops', `${full.a}–${full.b} turned away about ${nf(full.last.spill)} passengers. ${G.fullFix(s, full)}`, { kind: 'route', id: full.id }, 9);
    const loser = mine.filter(r => r.losses >= 2 || (r.last.profit < -0.5 && r.age >= 2)).sort((x, y) => x.last.profit - y.last.profit)[0];
    if (loser) add('fin', `${loser.a}–${loser.b} lost ${G.fmtM(-loser.last.profit)} last quarter. Cut the fare, swap the aircraft or close it.`, { kind: 'route', id: loser.id }, 8);
    const idle = G.surplusTotal(s, 0);
    if (idle > 0) add('ops', `${idle} surplus aircraft sat idle last quarter, still costing ownership and upkeep. Put them on a route or sell them. (One spare per busy fleet is kept as a reserve against delays.)`, { kind: 'tab', tab: 'fleet' }, 7);
    if (A.cash < 0) add('fin', `We're overdrawn and paying 3% interest. Bankruptcy hits below ${G.fmtM(-G.creditLimit(s, 0))}.`, { kind: 'tab', tab: 'company' }, 10);
    else if (A.cash > 350 && idle === 0 && !A.orders.length) add('fin', `${G.fmtM(A.cash)} is sitting in the bank. Money that isn't flying isn't earning.`, { kind: 'tab', tab: 'fleet' }, 4);

    const tight = A.hubs.filter(h => G.slotsAvail(s, 0, h) < 4)[0];
    if (tight) add('gov', G.airportFree(s, tight) > 0
      ? `Only ${Math.max(0, G.slotsAvail(s, 0, tight))} free slots left at our ${CITY[tight].name} hub. Send a negotiator before rivals take them.`
      : `Only ${Math.max(0, G.slotsAvail(s, 0, tight))} free slots left at our ${CITY[tight].name} hub, and the airport is full. Buy spare slots from a rival there, or free some by trimming a weaker route.`, { kind: 'city', code: tight }, 7);

    const hubable = G.CITIES.find(c => !G.hubBlock(s, 0, c.code));
    if (hubable) add('strat', `We already fly to ${hubable.name}. A hub there would open all of ${REGION[hubable.region].name} to us.`, { kind: 'city', code: hubable.code }, 8);
    else {
      const missing = REGIONS.filter(R => !A.hubs.some(h => CITY[h].region === R.id));
      if (missing.length) {
        const R = missing[0];
        const target = G.CITIES.filter(c => c.region === R.id && c.major && !G.cityClosed(s, 0, c.code))
          .find(c => A.hubs.some(h => !G.routeBlock(s, 0, h, c.code)));
        if (target) add('strat', `We have no hub in ${R.name}. Fly to ${target.name} first, then build one there.`, { kind: 'city', code: target.code }, 5);
      }
    }

    const g = G.goalStatus(s, 0);
    const homeR = CITY[A.home].region;
    if (!g.leads.includes(homeR) && (A.yr.pax[homeR] || 0) > 0) add('strat', `A rival carries more passengers than us in ${REGION[homeR].name}, our home region. We must lead it to win.`, { kind: 'tab', tab: 'company' }, 6);

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
