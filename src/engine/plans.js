// Things with a plan behind them: city contracts, crisis decisions, the advisor's goal plans,
// alternative objectives and short historical scenarios.
(function (G) {
  'use strict';
  const { CITY, CITIES, REGIONS, REGION, PLANE } = G;
  const fail = err => ({ ok: false, err });
  const nf = n => Math.round(n).toLocaleString('en-US');
  const pairOf = (s, i, a, b) => s.routes.find(r => r.o === i && G.pairKey(r.a, r.b) === G.pairKey(a, b));

  // ---------- city contracts ----------
  // A city offers a deal: fly a route at a set frequency for a number of quarters. In return it hands over
  // slots straight away, pays a subsidy every quarter you meet the target, and grows demand for good when you finish.
  G.contractOffer = function (s, code, other) {
    const st = G.cityStats(s, code), cur = pairOf(s, 0, code, other);
    const minFreq = cur ? Math.min(21, cur.freq + 4) : G.clamp(Math.round(st.econ * 0.8), 4, 10);
    const subsidy = Math.round((0.6 + st.econ * 0.25) * Math.max(0.4, G.eraScale(s)) * 10) / 10;
    return {
      other, minFreq, quarters: 4, subsidy, slots: Math.max(4, minFreq - (cur ? cur.freq : 0)),
      text: cur
        ? `${CITY[code].name} wants more flights to ${CITY[other].name}: at least ${minFreq} a week.`
        : `${CITY[code].name} wants a direct link to ${CITY[other].name}, at least ${minFreq} flights a week.`,
    };
  };
  G.contractEffect = q => `You get ${q.slots} slots at ${CITY[q.city].name} now. Fly ${q.city}–${q.other} at ${q.minFreq}+ a week from within two quarters, for ${q.quarters} quarters: $${q.subsidy}M subsidy each quarter (paid into cash, outside operating profit), then demand there +10% for good and relations +15. Miss it and the slots are taken back, relations −15.`;
  G.acceptContract = function (s, q) {
    const A = s.airlines[0];
    A.slots[q.city] = (A.slots[q.city] || 0) + q.slots;
    s.contracts.push({ id: q.id, city: q.city, other: q.other, minFreq: q.minFreq, need: q.quarters, done: 0, subsidy: q.subsidy, slots: q.slots, start: s.turn + 2, paid: 0 });
  };
  G.contractStatus = function (s, c) {
    const r = pairOf(s, 0, c.city, c.other);
    return { r, flying: r ? r.freq : 0, ok: !!r && r.freq >= c.minFreq };
  };
  G.checkContracts = function (s, rep) {
    const A = s.airlines[0];
    for (const c of s.contracts) {
      const st = G.contractStatus(s, c), name = `${c.city}–${c.other}`;
      if (st.ok) {
        c.done++; G.pay(A, c.subsidy, 'subsidy'); c.paid += c.subsidy;
        if (c.done >= c.need) {
          c.end = 'won';
          G.addRel(s, 0, c.city, 15);
          s.events.push({ kind: 'city', city: c.city, mult: 1.1, perm: true, left: 0, text: `${CITY[c.city].name} grew on the back of your ${name} link.`, mine: true });
          rep.news.push({ text: `Contract complete: ${name}. ${CITY[c.city].name} paid $${c.paid.toFixed(1)}M in total, demand there is up 10% for good, relations +15.`, good: true, route: st.r && st.r.id });
        } else rep.news.push({ text: `Contract ${name}: target met (${c.done}/${c.need}). Subsidy $${c.subsidy}M paid into cash (not part of operating profit).`, good: true, route: st.r && st.r.id });
      } else if (s.turn >= c.start || c.done > 0) {
        c.end = 'lost';
        G.addRel(s, 0, c.city, -15);
        A.slots[c.city] = Math.max(G.slotsHeld(s, 0, c.city) - G.slotsAvail(s, 0, c.city), (A.slots[c.city] || 0) - c.slots);
        rep.news.push({ text: `You broke the ${name} contract (${st.flying} of ${c.minFreq} weekly flights). ${CITY[c.city].name} took back its slots; relations −15.`, bad: true, urgent: true, route: st.r && st.r.id });
      } else {
        const left = c.start - s.turn;
        rep.news.push({ text: `Contract ${name}: fly it at ${c.minFreq}+ a week ${left > 1 ? `within ${left} quarters` : 'this coming quarter'} or it lapses.`, urgent: left <= 1, route: st.r && st.r.id });
      }
    }
    s.contracts = s.contracts.filter(c => !c.end);
  };

  // ---------- crises ----------
  // When a shock hits, the board must choose a response. Each option shows its cost and what it buys.
  G.makeCrisis = function (s, e) {
    const A = s.airlines[0], rs = G.routesOf(s, 0).filter(r => r.last);
    if (!rs.length || A.bankrupt) return;
    const flight = (A.lastFin && A.lastFin.flight) || 5, scale = Math.max(0.3, G.eraScale(s));
    const mult = e.mult || (e.kind === 'fuel' ? 1.3 : 0.8), qs = e.left || 3;
    if (e.kind === 'fuel') {
      const retro = Math.round(flight * 0.5 * 10) / 10;
      // a running fuel hedge keeps the old price for the quarters it still covers
      const hedged = !e.cost && A.hedge && A.hedge.left > 0 ? Math.min(qs, A.hedge.left) : 0;
      const est = flight * 0.3 * (mult - 1) * (qs - hedged);
      // a surcharge can quietly break the objective: say so on the option
      const w = rs.reduce((t, r) => t + r.last.pax, 0) || 1, avgFare = rs.reduce((t, r) => t + r.fare * r.last.pax, 0) / w;
      const clash = s.goal === 'lowcost' && avgFare + 10 > -10 ? ` Your average fare would be about ${avgFare + 10 >= 0 ? '+' : ''}${Math.round(avgFare + 10)}%, above the −10% the low-cost objective needs.`
        : s.goal === 'premium' ? ` The satisfaction drop counts against your satisfaction target.` : '';
      s.crisis = {
        title: e.cost ? 'Cost shock' : 'Fuel crisis', text: e.text || 'Oil prices have jumped.', est, qs,
        estText: `If you do nothing: about ${G.fmtM(est)} of extra ${e.cost ? 'operating' : 'fuel'} cost over ${qs} quarters${hedged ? ` (your fuel hedge covers the first ${hedged === 1 ? 'one' : hedged})` : ''}.`, options: [
          { key: 'surcharge', label: e.cost ? 'Add a security surcharge' : 'Add a fuel surcharge', cost: 0, desc: `All fares +10 points for ${qs} quarters, then back to what they were (unless you change them yourself). Revenue holds up, but satisfaction falls about 6 points and price-conscious travellers leave.${clash}` },
          { key: 'retrofit', label: 'Fuel-saving retrofits', cost: retro, desc: `Costs $${retro}M now. Flying costs −8% for two years.` },
          { key: 'absorb', label: 'Absorb the cost', cost: 0, desc: 'Keep fares as they are. Passengers notice: relations +4 in every city you serve.' },
        ],
      };
    } else {
      const where = e.kind === 'region' ? REGION[e.region].name : e.kind === 'world' ? 'every region' : CITY[e.city].name;
      const hit = rs.filter(r => e.kind === 'world' || (e.kind === 'region' ? [r.a, r.b].some(c => CITY[c].region === e.region) : [r.a, r.b].includes(e.city)));
      if (!hit.length) return;
      const promo = Math.round(4 * scale * 10) / 10;
      // fewer travellers, and those who still fly pay less
      const rev = hit.reduce((t, r) => t + r.last.rev, 0), y = 0.55 + 0.45 * mult;
      const est = rev * (1 - Math.min(1, mult * (1 - (e.fear || 0))) * y) * qs;
      s.crisis = {
        title: 'Demand shock', text: e.text, region: e.region, city: e.city, world: e.kind === 'world', est, qs,
        estText: `If you do nothing: revenue on the ${hit.length} affected route${hit.length > 1 ? 's' : ''} falls by about ${G.fmtM(est)} over ${qs} quarters (fewer travellers, lower fares).`, options: [
          { key: 'cut', label: 'Cut capacity', cost: 0, desc: `Fly 30% fewer flights on the ${hit.length} affected route${hit.length > 1 ? 's' : ''} in ${where} for 2 quarters; the flights come back automatically. Lower costs, but rivals may grab the passengers who remain.` },
          { key: 'promo', label: 'Fare sale and promotion', cost: promo, desc: `Costs $${promo}M. Your demand in ${where} +20% for two quarters, at fares 10 points lower; those fares go back up when the sale ends, unless you change them yourself.` },
          { key: 'hold', label: 'Stay the course', cost: 0, desc: `Keep flying as planned. Cities in ${where} remember loyalty: relations +6.` },
        ],
      };
    }
    s.crisis.id = s.turn;
  };
  // Temporary capacity cuts end on their own; flights return if slots and aircraft still allow it.
  G.restoreCuts = function (s, rep) {
    for (const r of G.routesOf(s, 0)) {
      // saves from before modifiers stacked kept one remembered fare: treat it as a single modifier
      if (r.fareTemp) { r.fareTemps = [{ d: r.fareTemp.to - r.fareTemp.from, left: r.fareTemp.left }]; delete r.fareTemp; }
      if (!r.fareTemps) continue;
      for (const t of r.fareTemps) t.left--;
      const done = r.fareTemps.filter(t => t.left <= 0);
      if (!done.length) continue;
      r.fareTemps = r.fareTemps.filter(t => t.left > 0);
      if (!r.fareTemps.length) delete r.fareTemps;
      r.fare = G.clamp(r.fare - done.reduce((t, x) => t + x.d, 0), -50, 50);
      rep.news.push({ route: r.id, text: `Temporary crisis fare over: ${r.a}–${r.b} is now ${r.fare >= 0 ? '+' : ''}${r.fare}%.` });
    }
    for (const r of G.routesOf(s, 0)) {
      if (!r.cutFrom || --r.cutFrom.left > 0) continue;
      const want = r.cutFrom.freq; delete r.cutFrom;
      if (want <= r.freq) continue;
      let back = r.freq;
      for (let f = want; f > r.freq; f--) { if (!G.validateSpec(s, 0, { ...r, freq: f }, r.id)) { back = f; break; } }
      if (back > r.freq) { rep.news.push({ route: r.id, text: `Crisis cut over: ${r.a}–${r.b} is back to ${back} flights a week${back < want ? ` (${want} wanted, but slots or aircraft ran short)` : ''}.` }); r.freq = back; }
      else rep.news.push({ route: r.id, urgent: true, text: `Crisis cut over, but ${r.a}–${r.b} couldn't return to ${want} a week: not enough slots or aircraft.` });
    }
  };
  G.resolveCrisis = function (s, key) {
    const c = s.crisis, A = s.airlines[0];
    if (!c) return fail('No decision is waiting.');
    const o = c.options.find(x => x.key === key);
    if (!o) return fail('Unknown choice.');
    if (A.cash < o.cost) return fail(`That costs $${o.cost}M. Not enough cash.`);
    G.pay(A, -o.cost, 'other');
    G.settleInLastQuarter(s, -o.cost, 'other');
    const rs = G.routesOf(s, 0);
    // a temporary fare change: a modifier on top of your fare, removed after `left` quarters unless you set the fare yourself.
    // Modifiers stack, so a promotion during a surcharge ends without wiping out the surcharge (or vice versa).
    const tempFare = (r, d, left) => { const to = G.clamp(r.fare + d, -50, 50); if (to !== r.fare) (r.fareTemps ||= []).push({ d: to - r.fare, left }); r.fare = to; };
    const inside = r => c.world || (c.region ? [r.a, r.b].some(x => CITY[x].region === c.region) : [r.a, r.b].includes(c.city));
    if (key === 'surcharge') { rs.forEach(r => tempFare(r, 10, c.qs || 3)); A.sat = Math.max(0, (A.sat ?? 50) - 6); }
    if (key === 'retrofit') A.fuelSave = { mult: 0.92, left: 8 };
    if (key === 'absorb') new Set(rs.flatMap(r => [r.a, r.b])).forEach(x => G.addRel(s, 0, x, 4));
    if (key === 'cut') rs.filter(inside).forEach(r => { r.cutFrom = { freq: r.freq, left: 2 }; r.freq = Math.max(1, Math.round(r.freq * 0.7)); });
    if (key === 'promo') {
      const regs = c.world ? REGIONS.map(R => R.id) : [c.region || CITY[c.city].region];
      regs.forEach(region => A.ads.push({ region, boost: 0.2, left: 2 }));
      rs.filter(inside).forEach(r => tempFare(r, -10, 2));
    }
    if (key === 'hold') new Set(rs.filter(inside).flatMap(r => [r.a, r.b])).forEach(x => G.addRel(s, 0, x, 6));
    s.crisis = null;
    return { ok: true, label: o.label };
  };

  // ---------- advisor plans ----------
  G.FOCUS = {
    profit: { name: 'Maximum profit', blurb: 'Fill seats at good fares, cut losers, stop paying for idle aircraft.' },
    share: { name: 'Grow market share', blurb: 'Carry more passengers: more flights, keener fares, new cities.' },
    sat: { name: 'Happier passengers', blurb: 'Better service and newer aircraft, without overcrowding.' },
  };
  // A short to-do list for the chosen goal, built from the real numbers.
  G.advisorPlan = function (s, focus) {
    const A = s.airlines[0], rs = G.routesOf(s, 0).filter(r => r.last), steps = [];
    const add = (text, action, w) => steps.push({ text, action, w });
    const idle = G.surplusTotal(s, 0);
    if (focus === 'profit') {
      for (const r of rs.filter(r => r.last.profit < 0).sort((x, y) => x.last.profit - y.last.profit).slice(0, 2))
        add(`${r.a}–${r.b} lost ${G.fmtM(-r.last.profit)}. Ask the route advisor, or close it.`, { kind: 'route', id: r.id }, 9);
      for (const r of rs.filter(r => r.last.spill > r.last.pax * 0.1).slice(0, 2))
        add(`${r.a}–${r.b} turns away ${nf(r.last.spill)} a quarter. ${r.fare < 50 ? `Raise the fare there (now ${r.fare >= 0 ? "+" : ""}${r.fare}%).` : G.fullFix(s, r)}`, { kind: "route", id: r.id }, 8);
      if (idle) add(`Sell or lease out ${idle} idle aircraft: they cost money every quarter.`, { kind: 'tab', tab: 'fleet' }, 7);
      const prem = rs.filter(r => (r.svc ?? 1) === 2 && r.last.biz < r.last.pax * 0.2)[0];
      if (prem) add(`${prem.a}–${prem.b} has premium service but few business travellers. Standard service is cheaper.`, { kind: 'route', id: prem.id }, 5);
      if ((A.debt || 0) > 0 && A.cash > A.debt * 1.5) add(`Repay your $${Math.round(A.debt)}M loan to cut interest.`, { kind: 'tab', tab: 'company' }, 4);
    } else if (focus === 'share') {
      for (const r of rs.filter(r => r.last.mkt && r.last.mkt.rivals > r.last.mkt.mine).sort((x, y) => y.last.mkt.rivals - x.last.mkt.rivals).slice(0, 2))
        add(`Rivals carry ${nf(r.last.mkt.rivals)} of the ${r.a}–${r.b} market to your ${nf(r.last.mkt.mine)}. Add flights or trim the fare.`, { kind: 'route', id: r.id }, 9);
      for (const r of rs.filter(r => r.last.mkt && r.last.mkt.freq > r.last.mkt.D * 0.1).slice(0, 1))
        add(`${r.a}–${r.b} is too infrequent: ${nf(r.last.mkt.freq)} people a quarter won't fly so rarely. More flights grow the market.`, { kind: 'route', id: r.id }, 7);
      const o = G.opportunities(s, 0, 1)[0];
      if (o) add(`Open ${o.a}–${o.b}: about ${nf(o.unmet)} unserved passengers a week.`, { kind: 'plan', a: o.a, b: o.b }, 8);
      if (idle) add(`Put ${idle} idle aircraft to work on new routes.`, { kind: 'tab', tab: 'fleet' }, 6);
    } else {
      const over = rs.filter(r => r.last.lf > 0.92).slice(0, 2);
      for (const r of over) add(`${r.a}–${r.b} is ${Math.round(r.last.lf * 100)}% full. Crowded cabins cost satisfaction; add a flight.`, { kind: 'route', id: r.id }, 8);
      const biz = rs.filter(r => (r.svc ?? 1) < 2).sort((x, y) => (y.last.biz || 0) - (x.last.biz || 0))[0];
      if (biz && biz.last.biz) add(`${biz.a}–${biz.b} carries ${nf(biz.last.biz)} business travellers. Premium service wins them over.`, { kind: 'route', id: biz.id }, 9);
      const old = G.fleetTypes(A).filter(t => G.avgAge(s, A, t) > 12).sort((x, y) => G.avgAge(s, A, y) - G.avgAge(s, A, x))[0];
      if (old) add(`Replace the ${PLANE[old].name} fleet (avg ${Math.round(G.avgAge(s, A, old))} years old).`, { kind: 'tab', tab: 'fleet' }, 7);
      const basic = rs.filter(r => (r.svc ?? 1) === 0)[0];
      if (basic) add(`${basic.a}–${basic.b} runs basic service, the biggest drag on satisfaction.`, { kind: 'route', id: basic.id }, 6);
    }
    if (!steps.length) add('Nothing urgent. Keep going.', null, 0);
    return steps.sort((x, y) => y.w - x.w).slice(0, 4);
  };

  // ---------- objectives ----------
  G.OBJECTIVES = {
    world: { name: 'World airline', blurb: 'A hub on every continent and the most passengers in most regions.' },
    regional: { name: 'Regional champion', blurb: 'Dominate your home region: lead it, serve most of its cities, stay profitable.' },
    premium: { name: 'Premium airline', blurb: 'The best-loved airline: top satisfaction, a 12% margin and hubs in four regions.' },
    lowcost: { name: 'Low-cost network', blurb: 'Carry more passengers than any rival at an average fare at least 10% below standard, at a profit.' },
    value: { name: 'Most valuable', blurb: 'Be the most valuable airline when the clock runs out.' },
  };
  // Progress toward the game's objective, as a checklist the UI can show.
  G.objectiveChecks = function (s, i, useLast) {
    const A = s.airlines[i], g = G.goalStatus(s, i, useLast), obj = s.goal || 'world', yr = useLast ? A.lastYr : A.yr;
    const homeR = CITY[A.home].region, rs = G.routesOf(s, i);
    const fmt = v => G.fmtM(v);
    const W = G.winRules(s), streak = { label: `Year-ends in a row meeting all of this`, val: `${A.streak || 0}/${W.years}`, ok: (A.streak || 0) > 0, streak: true };
    const net = (n, label) => ({ label: label || 'Routes flown', val: `${rs.length}/${n}`, ok: rs.length >= n });
    if (obj === 'world') return [
      { label: 'Regions with a hub', val: `${g.hubRegions.length}/7`, ok: g.hubRegions.length === REGIONS.length },
      { label: `Regions you lead with ${Math.round(W.share * 100)}%+ of passengers`, val: `${g.leads.length}/${s.difficulty}`, ok: g.leads.length >= s.difficulty },
      { label: 'Lead your home region', val: g.homeLead ? 'Yes' : 'No', ok: g.homeLead },
      net(W.routes),
      { label: 'Cities served', val: `${g.cities}/${W.cities}`, ok: g.cities >= W.cities },
      { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
      streak,
    ];
    if (obj === 'regional') {
      const cities = new Set(rs.flatMap(r => [r.a, r.b]).filter(c => CITY[c].region === homeR)).size;
      return [
        { label: `Lead ${REGION[homeR].name}`, val: g.homeLead ? 'Yes' : 'No', ok: g.homeLead },
        ...(G.goalTarget(s, 'regionLeads') > 1 ? [{ label: 'Regions you lead', val: `${g.leads.length}/${G.goalTarget(s, 'regionLeads')}`, ok: g.leads.length >= G.goalTarget(s, 'regionLeads') }] : []),
        { label: `Cities served in ${REGION[homeR].name}`, val: `${cities}/${G.goalTarget(s, 'regionCities')}`, ok: cities >= G.goalTarget(s, 'regionCities') },
        net(Math.round(W.routes * 0.7)),
        { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
        streak,
      ];
    }
    if (obj === 'premium') {
      const f = A.score || {};
      return [
        { label: 'Satisfaction', val: `${Math.round(A.sat ?? 50)}/${G.goalTarget(s, 'premiumSat')}`, ok: Math.round(A.sat ?? 50) >= G.goalTarget(s, 'premiumSat') },
        { label: 'Profit margin (last quarter)', val: `${Math.round((f.margin || 0) * 100)}%/12%`, ok: (f.margin || 0) >= 0.12 },
        { label: 'Regions with a hub', val: `${g.hubRegions.length}/4`, ok: g.hubRegions.length >= 4 },
        net(Math.round(W.routes * 0.6)),
        { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
        streak,
      ];
    }
    if (obj === 'lowcost') {
      const yrOf = j => (useLast ? s.airlines[j].lastYr : s.airlines[j].yr);
      // passengers carried: each traveller once, however many regions the trip touches
      const tot = j => (yrOf(j) ? yrOf(j).trips ?? Object.values(yrOf(j).pax).reduce((t, v) => t + v, 0) : 0);
      const mine = tot(i), most = s.airlines.every((B, j) => j === i || B.bankrupt || tot(j) < mine);
      const w = rs.reduce((t, r) => t + (r.last ? r.last.pax : 0), 0) || 1;
      const avgFare = rs.reduce((t, r) => t + r.fare * (r.last ? r.last.pax : 0), 0) / w;
      return [
        { label: 'Most passengers worldwide', val: `${most ? 'Yes' : 'No'} · ${mine >= 1e6 ? (mine / 1e6).toFixed(2) + 'M' : Math.round(mine / 1000) + 'k'}`, ok: most && mine > 0 },
        { label: 'Average fare', val: `${avgFare >= 0 ? '+' : ''}${Math.round(avgFare)}% / −10%`, ok: avgFare <= -10 },
        net(G.routeTarget(s, i)),
        { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
        streak,
      ];
    }
    const vals = s.airlines.map((B, j) => (B.bankrupt ? 0 : G.companyValue(s, j)));
    const m = G.goalTarget(s, 'valueMargin'), best = Math.max(0, ...vals.filter((v, j) => j !== i)), need = best * (1 + m);
    const top = vals[i] > best && vals[i] >= need;
    return [
      { label: m ? `Company value (need ${Math.round(m * 100)}% more than the top rival)` : 'Company value', val: m ? `${fmt(vals[i])} / ${fmt(need)}` : fmt(vals[i]), ok: top },
      { label: m ? `Most valuable by ${Math.round(m * 100)}%+` : 'Most valuable airline', val: top ? 'Yes' : 'No', ok: top },
    ];
  };
  // Year-end win test for the chosen objective. "value" is only decided when time runs out.
  G.objectiveWon = (s, i) => (s.goal || 'world') !== 'value' && G.objectiveChecks(s, i).filter(c => !c.streak).every(c => c.ok);

  // One shared picture of what the player is trying to do and how long is left, so that advice,
  // opportunity ranking, the tutorial and the board all pull the same way.
  G.quartersLeft = s => (s.endless ? 999 : Math.max(0, (s.end - s.year) * 4 - s.q));
  G.objectiveContext = function (s, i = 0) {
    const obj = s.goal || 'world', A = s.airlines[i], left = G.quartersLeft(s);
    const hubRegions = new Set(A.hubs.map(h => CITY[h].region)).size;
    const hubsNeed = obj === 'world' ? REGIONS.length : obj === 'premium' ? 4 : 0;
    const measures = {
      world: ['hubs in all 7 regions', 'regional passenger leads', 'network size', 'a profitable year'],
      regional: ['leading your home region', 'cities served at home', 'a profitable year'],
      premium: [`satisfaction ${G.goalTarget(s, 'premiumSat')}+`, 'a 12% margin', 'hubs in 4 regions'],
      lowcost: ['the most passengers', 'fares 10% below standard', 'a profitable year'],
      value: ['company value: net assets plus twice the last year\'s profit', 'cash counts in full, so spend only where it pays back'],
    }[obj];
    return {
      obj, name: G.OBJECTIVES[obj].name, left, final: left <= 4, measures,
      hubsNeed, hubRegions, hubsMatter: hubsNeed > hubRegions,
      homeLeadMatters: obj === 'world' || obj === 'regional',
      cashCounts: obj === 'value',
      // how far ahead an investment is judged: to the deadline in a scenario or value game, else five years
      horizon: s.scenario || obj === 'value' ? left : Math.min(20, left),
    };
  };
  // Company values recorded once, at the very end of each quarter, after every cash movement. The race
  // card and the debrief read only these, so consecutive reports always agree with each other.
  G.snapValues = function (s, label) {
    s.valHist ||= [];
    s.valHist.push({ turn: s.turn, label, vals: s.airlines.map((B, j) => (B.bankrupt ? 0 : G.companyValue(s, j))), profit: s.airlines.map((B, j) => G.annualProfit(s, j)) });
    if (s.valHist.length > 24) s.valHist.shift();
  };
  const leaderBesides = (vals, i, bankrupt) => vals.map((v, k) => [v, k]).filter(([, k]) => k !== i && !bankrupt[k]).sort((x, y) => y[0] - x[0])[0];
  // The last year of a value race: the gap to the most valuable rival at the last quarter end, how that
  // gap moved since the quarter before (same rival), the rival's earnings against yours, and the extra
  // profit a quarter that would close it.
  G.finalRace = function (s, i = 0) {
    const left = G.quartersLeft(s), H = s.valHist || [];
    const cur = H[H.length - 1];
    if (!cur) return null;
    const bk = s.airlines.map(B => !!B.bankrupt), top = leaderBesides(cur.vals, i, bk);
    if (!top) return null;
    // the gap is measured to what winning takes: the top rival's value plus the margin this difficulty asks for
    const margin = G.goalTarget(s, 'valueMargin'), j = top[1], B = s.airlines[j], gap = cur.vals[i] - cur.vals[j] * (1 + margin);
    const prev = H[H.length - 2];
    const gapPrev = prev ? prev.vals[i] - prev.vals[j] * (1 + margin) : null;
    const prevTop = prev && leaderBesides(prev.vals, i, bk);
    const was = prevTop && prevTop[1] !== j ? s.airlines[prevTop[1]].name : null;
    const myProfit = cur.profit[i], rivalProfit = cur.profit[j];
    // each extra $1M a quarter is banked every quarter left and counted twice in the year's profit
    const weight = left + 2 * Math.min(4, left);
    return { left, at: cur.label, me: cur.vals[i], j, rival: B.name, color: B.color, rivalValue: cur.vals[j], margin, target: cur.vals[j] * (1 + margin), gap, gapPrev, move: gapPrev == null ? null : gap - gapPrev, was,
      myProfit, rivalProfit, edge: rivalProfit - myProfit, closeQ: gap < 0 && weight ? -gap / weight : 0, weight };
  };
  // An end-of-game look back: how the airline's value, profit and cash moved, and what decided the result.
  G.debrief = function (s, i = 0) {
    const A = s.airlines[i], H = A.history.filter(h => h.value != null);
    if (!H.length) return null;
    const lbl = h => `${h.y} Q${h.q + 1}`;
    const best = H.reduce((x, h) => (h.profit > x.profit ? h : x)), worst = H.reduce((x, h) => (h.profit < x.profit ? h : x));
    const low = H.reduce((x, h) => (h.cash < x.cash ? h : x));
    const VH = s.valHist || [], last = VH[VH.length - 1];
    const startV = s.startValue ?? H[0].value, endV = last ? last.vals[i] : G.companyValue(s, i);
    const others = s.airlines.map((B, j) => ({ j, name: B.name, v: last ? last.vals[j] : B.bankrupt ? 0 : G.companyValue(s, j), p: last ? last.profit[j] : G.annualProfit(s, j), bankrupt: B.bankrupt })).filter(x => x.j !== i).sort((x, y) => y.v - x.v);
    const top = others[0];
    const lines = [];
    lines.push(`Company value went from ${G.fmtM(startV)} to ${G.fmtM(endV)}.`);
    lines.push(`Best quarter: ${lbl(best)}, profit ${G.fmtM(best.profit)}. Worst: ${lbl(worst)}, ${G.fmtM(worst.profit)}.`);
    lines.push(`Lowest quarter-end cash: ${G.fmtM(low.cash)} in ${lbl(low)}.`);
    if (top) {
      const gap = endV - top.v;
      // only a value race is decided by company value; for other objectives it is context, not the verdict
      const race = (s.goal || 'world') === 'value';
      if (!race) lines.push(gap >= 0 ? `On company value you also finished ${G.fmtM(gap)} ahead of ${top.name}.` : `On company value ${top.name} finished ${G.fmtM(-gap)} ahead of you, though value was not this objective's measure.`);
      else lines.push(gap >= 0 ? `You finished ${G.fmtM(gap)} ahead of ${top.name}.` : `${top.name} finished ${G.fmtM(-gap)} ahead of you.`);
      const m = s.goal === 'value' ? G.goalTarget(s, 'valueMargin') : 0;
      if (m && gap >= 0 && endV < top.v * (1 + m)) lines.push(`Winning needed ${Math.round(m * 100)}% more than ${top.name}: ${G.fmtM(top.v * (1 + m))}. You were ${G.fmtM(top.v * (1 + m) - endV)} short.`);
      const myP = last ? last.profit[i] : G.annualProfit(s, i);
      if (race && Math.abs(top.p - myP) > 1) lines.push(top.p > myP ? `${top.name} earned ${G.fmtM(top.p - myP)} more than you in the final year, worth ${G.fmtM(2 * (top.p - myP))} in company value.` : `You out-earned ${top.name} by ${G.fmtM(myP - top.p)} in the final year, worth ${G.fmtM(2 * (myP - top.p))} in company value.`);
      const y4 = VH.length > 4 ? VH[VH.length - 5] : null;
      if (race && y4) {
        const was = y4.vals[i] - y4.vals[top.j];
        lines.push(`A year before the end the gap was ${was >= 0 ? `${G.fmtM(was)} in your favour` : `${G.fmtM(-was)} against you`}; it ${gap - was >= 0 ? `moved ${G.fmtM(gap - was)} your way` : `moved ${G.fmtM(was - gap)} against you`} in the final year.`);
      }
      // what decided it: earning capacity (seats flown) and how well those seats were used
      const cap = j => { const rs = G.routesOf(s, j); return { seats: rs.reduce((t, r) => t + G.seatsOn(r) * r.freq, 0), routes: rs.length,
        lf: (() => { const f = rs.filter(r => r.last); const w = f.reduce((t, r) => t + G.seatsOn(r) * r.freq, 0); return w ? f.reduce((t, r) => t + r.last.lf * G.seatsOn(r) * r.freq, 0) / w : 0; })() }; };
      const me = cap(i), them = cap(top.j);
      if (me.seats && them.seats) {
        const more = them.seats / me.seats - 1;
        lines.push(`At the end you flew ${Math.round(me.seats).toLocaleString('en-US')} seats a week on ${me.routes} routes, ${Math.round(me.lf * 100)}% full; ${top.name} flew ${Math.round(them.seats).toLocaleString('en-US')} on ${them.routes}, ${Math.round(them.lf * 100)}% full.`);
        const thin = G.routesOf(s, i).filter(r => r.last && r.last.lf < 0.65).sort((x, y) => G.seatsOn(y) * y.freq - G.seatsOn(x) * x.freq)[0];
        const idle = G.surplusTotal(s, i);
        if (!race) { /* the objective card above explains the result */ }
        else if (gap < 0) {
          const why = [];
          if (more > 0.15) why.push(`${top.name} had ${Math.round(more * 100)}% more seats earning money`);
          if (thin) why.push(`${thin.a}–${thin.b} flew ${Math.round(thin.last.lf * 100)}% full on ${thin.planes} × ${PLANE[thin.type].name}, aircraft that could have earned more elsewhere`);
          if (idle) why.push(`${idle} aircraft ended the game idle`);
          if (me.lf < them.lf - 0.05) why.push(`your seats were less full than theirs`);
          lines.push(why.length ? `What decided it: ${why.join('; ')}.` : `What decided it: ${top.name} simply earned more from a similar network; higher-yield markets or better connections would have closed the gap.`);
        } else if (more < -0.15) lines.push(`Your extra capacity paid off: ${Math.round(-more * 100)}% more seats than ${top.name}, and you kept them ${Math.round(me.lf * 100)}% full.`);
      }
    }
    return { lines, startV, endV, best, worst, low, top };
  };
  // Company value gained by the deadline from a change worth `gain` a quarter in profit, after `cash`
  // spent on aircraft that keep most of their value (lost: the part that will not come back).
  G.valueByDeadline = function (s, gain, lost = 0, lag = 0) {
    // a move that waits for aircraft deliveries or slot talks only starts earning `lag` quarters later
    const h = Math.max(0, G.objectiveContext(s).horizon - lag);
    // profit banked each quarter until the end, plus twice the year's profit counted in company value
    return gain * h + 2 * gain * Math.min(4, h) - lost;
  };


  // ---------- scenarios ----------
  G.SCENARIOS = [
    { id: 'oil73', name: 'The Oil Shock', start: 1973, era: 1970, years: 5, home: 'LHR', goal: 'value', cash: 220,
      blurb: '1973: an oil embargo is coming this autumn. Steer a London airline through it and come out the most valuable.' },
    { id: 'dereg78', name: 'Deregulation', start: 1978, era: 1970, years: 5, home: 'ORD', goal: 'regional', cash: 240,
      blurb: 'American skies open up. Build the champion of North America from Chicago.' },
    { id: 'asia90', name: 'Asian Tigers', start: 1990, era: 1985, years: 6, home: 'HKG', goal: 'lowcost', cash: 300,
      blurb: 'Asia is booming. Carry more people than anyone with cheap fares out of Hong Kong.' },
    { id: 'gulf00', name: 'Desert Super-hub', start: 2000, era: 2000, years: 6, home: 'DXB', goal: 'premium', cash: 360,
      blurb: 'Turn Dubai into the world\'s favourite connecting point with a premium product.' },
    { id: 'crisis01', name: 'Crisis Decade', start: 2001, era: 2000, years: 5, home: 'JFK', goal: 'value', cash: 320,
      blurb: 'Terror, SARS and soaring oil, back to back. Survive and outgrow your rivals.',
      // harder than the campaign's history: flights empty out, costs climb, and oil keeps rising
      shocks: [
        { y: 2001, q: 2, kind: 'region', region: 'NA', mult: 0.8, fear: 0.3, left: 4, text: 'North Americans stay home: security queues and fear empty flights to and from the US.' },
        { y: 2001, q: 3, kind: 'fuel', cost: true, mult: 1.12, left: 8, text: 'War-risk insurance and new security rules push up every airline’s costs for two years.' },
        { y: 2002, q: 1, kind: 'world', mult: 0.9, fear: 0.08, left: 3, text: 'The recovery stalls: corporate travel budgets stay frozen.', biz: true },
        { y: 2003, q: 0, kind: 'world', mult: 0.85, fear: 0.12, left: 2, text: 'War in Iraq: travellers wait it out and oil spikes.', fuel: 1.3 },
        { y: 2003, q: 1, kind: 'region', region: 'AS', mult: 0.85, fear: 0.2, left: 3, text: 'SARS spreads beyond Asia’s borders: long-haul flights to Asia run half empty.' },
        { y: 2004, q: 1, kind: 'fuel', mult: 1.25, left: 8, text: 'Oil climbs past $40 a barrel and keeps going.' },
        { y: 2005, q: 2, kind: 'fuel', mult: 1.2, left: 3, text: 'Hurricanes shut Gulf refineries. Jet fuel spikes again.' },
      ] },
  ];
  G.SCENARIO = Object.fromEntries(G.SCENARIOS.map(x => [x.id, x]));

  // ---------- suggested schedules ----------
  // Tries every frequency the slots and aircraft allow (a handful around demand in quick mode) and keeps
  // the one with the biggest change in company profit, measured exactly as the route planner measures it:
  // route profit less slot fees plus the effect on your other routes. Aircraft you already own cost the
  // same flying or idle, so only aircraft that would have to be bought are charged. Ties go to fewer
  // aircraft. Fare, service, cabin and peak settings in `spec` are kept as they are.
  G.scheduleValue = (pv, buy, type) => pv.profit - pv.slotFee + pv.knock - buy * PLANE[type].price * G.OWN_RATE;
  // When choosing a schedule, an aircraft you already own is not free: it could fly somewhere else.
  // Each one used is charged half its ownership cost, so a frequency that needs another aircraft must
  // earn at least that much more. (The value reported back is still the plain change in profit.)
  G.SPARE_RATE = 0.5;
  G.scheduleScore = (pv, buy, used, type) => G.scheduleValue(pv, buy, type) - used * PLANE[type].price * G.OWN_RATE * G.SPARE_RATE;
  G.suggestSchedule = function (s, i, spec, opt = {}) {
    const { a, b, type } = spec;
    if (!a || !b || !PLANE[type]) return null;
    const d = G.dist(a, b), seats = PLANE[type].seats, cap = opt.maxPlanes == null ? 99 : Math.max(1, opt.maxPlanes);
    const owned = opt.owned ?? (opt.maxPlanes == null ? 0 : cap);
    const slotMax = opt.ignoreSlots ? 28 : Math.min(G.slotsAvail(s, i, a, opt.exceptId), G.slotsAvail(s, i, b, opt.exceptId));
    const top = Math.max(1, Math.min(28, slotMax, G.maxFreq(type, cap, d)));
    const want = Math.max(2, Math.round(G.baseDemand(s, a, b) * 0.5 / seats));
    const cands = opt.quick
      ? [...new Set([0.5, 0.75, 1, 1.3, 1.7].map(k => G.clamp(Math.round(want * k), 1, top)))]
      : Array.from({ length: top }, (_, k) => k + 1);
    const base = G.runNetwork(s);
    let best = null;
    for (const freq of cands.sort((x, y) => x - y)) {
      const planes = Math.min(cap, Math.max(1, Math.ceil(freq * G.rtHours(type, d) / G.HOURS_PER_PLANE)));
      if (freq > G.maxFreq(type, planes, d)) continue;
      const pv = G.previewRoute(s, i, { fare: 0, svc: 1, cab: 0, peak: false, ...spec, planes, freq }, opt.exceptId, base);
      const buy = Math.max(0, planes - owned), v = G.scheduleValue(pv, buy, type), score = G.scheduleScore(pv, buy, planes - buy, type);
      if (!best || score > best.score + 1e-9) best = { planes, freq, v, score, pv };
    }
    return best;
  };

  // ---------- recovery check for a value race that is slipping away ----------
  // Compares the gap to the leader with what the ranked moves and a few bigger plays (new markets with
  // idle or newly bought aircraft) could add by the finish, so the advice is honest about scale.
  G.recoveryPlan = function (s) {
    const R = G.finalRace(s, 0);
    if (!R || R.gap >= 0 || R.left <= 0) return null;
    const A = s.airlines[0], gapV = -R.gap;
    const moves = G.decisions(s).filter(x => x.best && x.best.byEnd > 0);
    const small = moves.reduce((t, x) => t + x.best.byEnd, 0), smallQ = moves.reduce((t, x) => t + x.best.gain, 0);
    // never count the same aircraft, market or cash twice: the ranked moves come first, and each bigger
    // play only uses the idle aircraft and cash still left after the ones before it
    const big = [], spare = {}, taken = new Set(s.routes.filter(r => r.o === 0).map(r => G.pairKey(r.a, r.b)));
    let cashLeft = Math.max(0, A.cash) - moves.reduce((t, x) => t + (x.best.cash || 0), 0);
    for (const t of G.fleetTypes(A)) spare[t] = G.idle(s, 0, t);
    for (const x of moves) {
      const b = x.best;
      if (x.plan) taken.add(G.pairKey(x.plan.a, x.plan.b));
      if (b.spec && x.plan) spare[b.spec.type] = Math.max(0, (spare[b.spec.type] || 0) - b.spec.planes + (b.buy || 0));
    }
    for (const o of G.opportunities(s, 0, 10).filter(o => !taken.has(G.pairKey(o.a, o.b))).slice(0, 4)) {
      if (big.length >= 2) break;
      const types = [...new Set([...G.fleetTypes(A).filter(t => spare[t] > 0), ...G.buyableTypes(s, 0).map(P => P.id)])]
        .filter(t => PLANE[t].range >= o.d).sort((x, y) => (spare[y] || 0) - (spare[x] || 0) || PLANE[x].hourly / PLANE[x].seats - PLANE[y].hourly / PLANE[y].seats).slice(0, 2);
      let best = null;
      for (const type of types) {
        const idle = spare[type] || 0;
        const sch = G.suggestSchedule(s, 0, { a: o.a, b: o.b, type }, { quick: true, ignoreSlots: true, owned: idle, maxPlanes: 6 });
        if (!sch) continue;
        const buy = Math.max(0, sch.planes - idle), price = G.planePrice(s, 0, type);
        const slots = [o.a, o.b].map(c => ({ c, n: Math.max(0, sch.freq - G.slotsAvail(s, 0, c)) })).filter(z => z.n > 0);
        // a full airport where no rival sells slots cannot be reached in time
        if (slots.some(z => G.airportFree(s, z.c) < z.n && G.slotOffers(s, 0, z.c).reduce((t, x) => t + x.n, 0) < z.n)) continue;
        const slotCash = slots.reduce((t, z) => t + G.slotPrice(s, z.c) * ([5, 10, 20].find(v => v >= z.n) || 20), 0);
        const cash = buy * price + slotCash;
        if (cash > cashLeft) continue;
        const lost = buy * (price - G.planeValue(s, type, 0)) + slotCash;
        const byEnd = G.valueByDeadline(s, sch.v, lost, buy || slots.length ? 1 : 0);
        if (byEnd > 0 && (!best || byEnd > best.byEnd))
          best = { a: o.a, b: o.b, type, freq: sch.freq, planes: sch.planes, buy, cash, gain: sch.v, byEnd, label: `open ${o.a}–${o.b}, ${sch.freq} a week on ${sch.planes} × ${PLANE[type].name}${buy ? ` (buy ${buy})` : ''}${slots.length ? `; first win ${slots.map(z => `${z.n} slots at ${z.c}`).join(' and ')}` : ''}` };
      }
      if (best) { big.push(best); spare[best.type] = Math.max(0, (spare[best.type] || 0) - (best.planes - best.buy)); cashLeft -= best.cash; }
    }
    const bigTop = big, bigV = bigTop.reduce((t, x) => t + x.byEnd, 0);
    // each move is forecast against today's network; done together they overlap, so count 85% of the sum
    const total = (small + bigV) * 0.85, reach = total / gapV;
    return { gapV, needQ: R.closeQ, small, smallQ, n: moves.length, big: bigTop, total, reach,
      verdict: reach >= 1 ? 'possible' : reach >= 0.5 ? 'stretch' : 'out of reach', idle: G.surplusTotal(s, 0) };
  };

  // ---------- try an aircraft before buying it ----------
  // Puts a type you do not (yet) fly on your current routes and on your best untapped markets, as if you
  // bought what each schedule needs. Each result is the change in company profit a quarter after the
  // aircraft's ownership cost and any extra fleet-mix cost, with standard and premium cabins tried.
  G.tryPlane = function (s, i, type) {
    const A = s.airlines[i], P = PLANE[type], idle = G.idle(s, i, type);
    const mix0 = G.commonality(s, i).cost;
    A.fleet.push({ type, n: 1, built: s.year, _try: true });
    const mixDelta = G.commonality(s, i).cost - mix0;
    A.fleet = A.fleet.filter(f => !f._try);
    const price = G.planePrice(s, i, type), lease = G.leaseCost(s, i, type);
    const configs = [{ svc: 1, cab: 0, label: 'standard' }, ...(P.comfort >= 1.1 || P.seats >= 250 ? [{ svc: 2, cab: 2, label: 'premium, business-heavy' }] : [])];
    const cands = [];
    for (const r of G.routesOf(s, i).filter(r => P.range >= G.dist(r.a, r.b) && r.type !== type).sort((x, y) => (y.last ? y.last.rev : 0) - (x.last ? x.last.rev : 0)).slice(0, 5))
      cands.push({ a: r.a, b: r.b, r });
    for (const o of G.opportunities(s, i, 10).filter(o => P.range >= o.d).slice(0, 3)) cands.push({ a: o.a, b: o.b, opp: o });
    const out = [];
    for (const c of cands) {
      let best = null;
      for (const cf of configs) {
        const spec = c.r ? { a: c.a, b: c.b, type, fare: c.r.fare, svc: cf.svc, cab: cf.cab, peak: !!c.r.peak } : { a: c.a, b: c.b, type, fare: cf.svc === 2 ? 10 : 0, svc: cf.svc, cab: cf.cab, peak: false };
        const sch = G.suggestSchedule(s, i, spec, { quick: true, ignoreSlots: !c.r, exceptId: c.r ? c.r.id : undefined, owned: idle, maxPlanes: 8 });
        if (!sch) continue;
        const cur = c.r ? G.previewRoute(s, i, { a: c.r.a, b: c.r.b, type: c.r.type, planes: c.r.planes, freq: c.r.freq, fare: c.r.fare, svc: c.r.svc ?? 1, cab: c.r.cab || 0, peak: !!c.r.peak }, c.r.id) : null;
        const buy = Math.max(0, sch.planes - idle);
        const before = cur ? cur.profit - cur.slotFee : 0;
        const change = sch.v - before - mixDelta;
        if (!best || change > best.change) best = { ...c, config: cf.label, svc: cf.svc, cab: cf.cab, freq: sch.freq, planes: sch.planes, buy, change, route: sch.pv.profit, lf: sch.pv.lf, cash: buy * price, leaseNow: buy * lease * 2 };
      }
      if (best) out.push(best);
    }
    out.sort((x, y) => y.change - x.change);
    return { type, price, value0: G.planeValue(s, type, 0), value1: G.planeValue(s, type, 1), own: price * G.OWN_RATE, lease, mixDelta, idle, results: out };
  };

  // ---------- planned routes ----------
  // Routes the player means to fly once aircraft and slots are in place. Each one reports what is
  // still missing, so the player can go straight to the next step.
  G.PLANNED_MAX = 20;
  G.addPlanned = function (s, i, a, b) {
    const A = s.airlines[i], list = (A.planned ||= []);
    if (a === b) return fail('Pick two different cities.');
    if (pairOf(s, i, a, b)) return fail(`You already fly ${a}–${b}.`);
    if (list.some(p => G.pairKey(p.a, p.b) === G.pairKey(a, b))) return fail(`${a}–${b} is already on your planned list.`);
    if (list.length >= G.PLANNED_MAX) return fail(`You can plan up to ${G.PLANNED_MAX} routes. Remove one first.`);
    list.push({ a, b, t: s.turn });
    return { ok: true };
  };
  G.removePlanned = function (s, i, a, b) {
    const A = s.airlines[i];
    A.planned = (A.planned || []).filter(p => G.pairKey(p.a, p.b) !== G.pairKey(a, b));
    return { ok: true };
  };
  // Drops planned routes that are now flown; returns the ones that just became ready to open.
  G.prunePlanned = function (s, i) {
    const A = s.airlines[i];
    A.planned = (A.planned || []).filter(p => !pairOf(s, i, p.a, p.b));
    return A.planned;
  };
  G.plannedStatus = function (s, i, p) {
    const A = s.airlines[i];
    let a = p.a, b = p.b;
    const okFrom = (x, y) => G.originsFor(s, i, y).includes(x);
    if (!okFrom(a, b)) { if (okFrom(b, a)) [a, b] = [b, a]; else { const o = G.originsFor(s, i, b)[0]; if (o && o !== b) a = o; } }
    const block = okFrom(a, b) ? null : G.routeBlock(s, i, p.a, p.b) || 'None of your hubs can reach it yet.';
    const d = G.dist(a, b);
    const onOrder = t => A.orders.filter(o => o.type === t).reduce((n, o) => n + o.n, 0);
    const owned = G.fleetTypes(A).filter(t => PLANE[t].range >= d);
    let type = owned.filter(t => G.idle(s, i, t) > 0).sort((x, y) => PLANE[y].seats - PLANE[x].seats)[0]
      || [...new Set(A.orders.map(o => o.type))].filter(t => PLANE[t].range >= d)[0]
      || owned[0];
    let src = type ? 'fleet' : 'buy';
    if (!type) {
      const buy = G.buyableTypes(s, i).filter(P => P.range >= d).sort((x, y) => x.hourly / x.seats - y.hourly / y.seats || x.price - y.price)[0];
      type = buy && buy.id;
    }
    if (!type) return { a, b, d, block: block || `No aircraft on sale has the range for ${nf(d)} km yet.`, ready: false };
    const sch = G.suggestSchedule(s, i, { a, b, type }, { ignoreSlots: true, quick: true, owned: G.idle(s, i, type) });
    const need = sch ? sch.planes : 1, freq = sch ? sch.freq : 1;
    const idle = G.idle(s, i, type), coming = onOrder(type), short = Math.max(0, need - idle - coming);
    const slots = [a, b].map(c => ({ c, free: Math.max(0, G.slotsAvail(s, i, c)), need: freq, pending: A.pending.some(x => x.city === c && x.kind === 'slots') }));
    const slotsOk = slots.every(x => x.free >= x.need);
    const ready = !block && idle >= need && slotsOk;
    // can it open now at a smaller size with what is already here?
    const nowFreq = !block && idle > 0 ? Math.min(G.maxFreq(type, Math.min(idle, need), d), ...slots.map(x => x.free)) : 0;
    return { a, b, d, block, type, src, need, freq, idle, coming, short, slots, slotsOk, ready, nowFreq, pv: sch && sch.pv, price: G.planePrice(s, i, type) };
  };

  // ---------- staged objective ----------
  // The final objective is long. These stages mark the way there, scaled to the same rules.
  G.routeTarget = function (s, i = 0) {
    const W = G.winRules(s, i), obj = s.goal || 'world';
    return obj === 'world' ? W.routes : obj === 'lowcost' ? Math.round(W.routes * 0.8) : obj === 'regional' ? Math.round(W.routes * 0.7) : obj === 'premium' ? Math.round(W.routes * 0.6) : 0;
  };
  // Reaching a stage earns something you can use: room to grow, people, goodwill.
  G.STAGE_REWARDS = [
    'Slot concession: 10 extra slots at your home airport (or their value in cash if it is full).',
    'A fourth negotiator, every quarter from now on.',
    'Relations +10 in every city you serve, and 5 slots at each of your hubs where there is room.',
    'The board backs you: confidence +20.',
  ];
  G.stageReward = function (s, i, k) {
    const A = s.airlines[i];
    if (k === 1) {
      const n = Math.min(10, Math.max(0, G.airportFree(s, A.home)));
      A.slots[A.home] = (A.slots[A.home] || 0) + n;
      const cash = (10 - n) * G.slotPrice(s, A.home);
      G.pay(A, cash, 'other');
      return n ? `${n} extra slots at ${A.home}${cash ? ` and ${G.fmtM(cash)}` : ''}.` : `${A.home} is full, so you get ${G.fmtM(cash)} instead of slots.`;
    }
    if (k === 2) { A.bonusAgents = (A.bonusAgents || 0) + 1; return 'You now have a fourth negotiator every quarter.'; }
    if (k === 3) {
      new Set(G.routesOf(s, i).flatMap(r => [r.a, r.b])).forEach(c => G.addRel(s, i, c, 10));
      const got = A.hubs.filter(h => G.airportFree(s, h) > 0).map(h => { const n = Math.min(5, G.airportFree(s, h)); A.slots[h] = (A.slots[h] || 0) + n; return h; });
      return `Relations +10 everywhere you fly${got.length ? `, and extra slots at ${got.join(', ')}` : ''}.`;
    }
    if (k === 4 && s.board) { s.board.conf = Math.min(100, s.board.conf + 20); return 'Board confidence +20.'; }
    return '';
  };
  // Is the network growing fast enough to reach the route target with time left to hold the objective?
  G.objectivePace = function (s, i) {
    const A = s.airlines[i], T = G.routeTarget(s, i), have = G.routesOf(s, i).length;
    if (!T) return null;
    const W = G.winRules(s, i), left = Math.max(0, s.end - s.year - s.q / 4 - W.years);
    const yearAgo = A.history.length >= 5 ? A.history[A.history.length - 5].routes : null;
    const need = have >= T ? 0 : left > 0 ? (T - have) / left : Infinity;
    return { T, have, left, need, recent: yearAgo != null ? have - yearAgo : null };
  };
  G.objectiveStages = function (s, i) {
    const obj = s.goal || 'world';
    if (obj === 'value') return null;
    // early in a year there is little to judge, so Q1 looks at the whole of last year
    const A = s.airlines[i], useLast = s.q === 0 && !!A.lastYr, W = G.winRules(s, i), g = G.goalStatus(s, i, useLast), rs = G.routesOf(s, i).length, T = G.routeTarget(s, i);
    const req = (label, have, need, fmt) => ({ label, have, need, ok: have >= need, val: fmt ? fmt(have, need) : `${have}/${need}` });
    const yes = (label, ok) => ({ label, have: ok ? 1 : 0, need: 1, ok, val: ok ? 'Yes' : 'Not yet' });
    const checks = G.objectiveChecks(s, i, useLast).filter(c => !c.streak);
    let stages;
    if (obj === 'world') stages = [
      { name: 'Foothold', reqs: [req('Routes', rs, Math.round(T * 0.2)), req('Hubs', A.hubs.length, 2)] },
      { name: 'Regional power', reqs: [req('Routes', rs, Math.round(T * 0.45)), req('Regions with a hub', g.hubRegions.length, 4), yes('Lead your home region this year', g.homeLead)] },
      { name: 'Intercontinental', reqs: [req('Routes', rs, Math.round(T * 0.7)), req('Regions with a hub', g.hubRegions.length, 6), req('Cities served', g.cities, Math.round(W.cities * 0.7)), req('Regions you lead this year', g.leads.length, Math.max(2, s.difficulty - 2))] },
      { name: 'World airline', reqs: checks.map(c => yes(`${c.label} (${c.val})`, c.ok)) },
    ];
    else stages = [
      { name: 'Getting established', reqs: [req('Routes', rs, Math.round(T * 0.25)), req('Hubs', A.hubs.length, 2)] },
      { name: 'Growing', reqs: [req('Routes', rs, Math.round(T * 0.6)), yes('Profitable so far this year', g.profit > 0)] },
      { name: G.OBJECTIVES[obj].name, reqs: checks.map(c => yes(`${c.label} (${c.val})`, c.ok)) },
    ];
    stages.push({ name: 'Champion', reqs: [req('Year-ends in a row meeting it all', A.streak || 0, W.years)] });
    let reached = 0;
    while (reached < stages.length && stages[reached].reqs.every(r => r.ok)) reached++;
    return { stages, reached, best: Math.max(reached, A.stageHit || 0) };
  };
  // The full rules for an objective, for the start screen, before a game exists.
  G.objectiveRules = function (goal, difficulty, scenario) {
    const W = G.winRules({ difficulty, scenario }, 0), obj = goal || 'world', share = Math.round(W.share * 100);
    const streak = W.years > 1 ? `Meet all of it at ${W.years} year-ends in a row.` : 'Meet all of it at a year-end.';
    const T = G.routeTarget({ difficulty, scenario, goal: obj }, 0);
    if (obj === 'world') return [`A hub in all 7 regions.`, `Lead ${difficulty} regions, including your home region: the most passengers there, and at least ${share}% of them.`, `${T}+ routes serving ${W.cities}+ cities.`, 'A profitable year.', streak];
    const gt = k => G.goalTarget({ difficulty, scenario }, k);
    if (obj === 'regional') return [gt('regionLeads') > 1 ? `Lead your home region and ${gt('regionLeads') - 1 > 1 ? gt('regionLeads') - 1 + ' others' : 'one other'}.` : 'Lead your home region.', `Serve ${gt('regionCities')} cities in your home region.`, `${T}+ routes.`, 'A profitable year.', streak];
    if (obj === 'premium') return [`Passenger satisfaction of ${gt('premiumSat')} or more.`, 'A 12% profit margin.', 'Hubs in 4 regions.', `${T}+ routes.`, 'A profitable year.', streak];
    if (obj === 'lowcost') return ['Carry more passengers than any rival.', 'An average fare at least 10% below standard.', `${T}+ routes.`, 'A profitable year.', streak];
    const vm = gt('valueMargin');
    return [vm ? `Be the most valuable airline when the clock runs out, worth at least ${Math.round(vm * 100)}% more than the next.` : 'Be the most valuable airline when the clock runs out.'];
  };
})(globalThis.G);
