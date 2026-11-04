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
  G.contractEffect = q => `You get ${q.slots} slots at ${CITY[q.city].name} now. Fly ${q.city}–${q.other} at ${q.minFreq}+ a week from within two quarters, for ${q.quarters} quarters: $${q.subsidy}M subsidy each quarter, then demand there +10% for good and relations +15. Miss it and the slots are taken back, relations −15.`;
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
        c.done++; A.cash += c.subsidy; c.paid += c.subsidy;
        if (c.done >= c.need) {
          c.end = 'won';
          G.addRel(s, 0, c.city, 15);
          s.events.push({ kind: 'city', city: c.city, mult: 1.1, left: 999, text: `${CITY[c.city].name} grew on the back of your ${name} link.`, mine: true });
          rep.news.push({ text: `Contract complete: ${name}. ${CITY[c.city].name} paid $${c.paid.toFixed(1)}M in total, demand there is up 10% for good, relations +15.`, good: true, route: st.r && st.r.id });
        } else rep.news.push({ text: `Contract ${name}: target met (${c.done}/${c.need}). Subsidy $${c.subsidy}M received.`, good: true, route: st.r && st.r.id });
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
      const est = flight * 0.3 * (mult - 1) * qs;
      s.crisis = {
        title: 'Fuel crisis', text: e.text || 'Oil prices have jumped.', est, qs,
        estText: `If you do nothing: about ${G.fmtM(est)} of extra fuel cost over ${qs} quarters.`, options: [
          { key: 'surcharge', label: 'Add a fuel surcharge', cost: 0, desc: 'All fares +10 points. Revenue holds up, but satisfaction falls about 6 points and price-conscious travellers leave.' },
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
      const est = rev * (1 - mult * y) * qs;
      s.crisis = {
        title: 'Demand shock', text: e.text, region: e.region, city: e.city, world: e.kind === 'world', est, qs,
        estText: `If you do nothing: revenue on the ${hit.length} affected route${hit.length > 1 ? 's' : ''} falls by about ${G.fmtM(est)} over ${qs} quarters (fewer travellers, lower fares).`, options: [
          { key: 'cut', label: 'Cut capacity', cost: 0, desc: `Fly 30% fewer flights on the ${hit.length} affected route${hit.length > 1 ? 's' : ''} in ${where} for 2 quarters; the flights come back automatically. Lower costs, but rivals may grab the passengers who remain.` },
          { key: 'promo', label: 'Fare sale and promotion', cost: promo, desc: `Costs $${promo}M. Your demand in ${where} +20% for two quarters, at fares 10 points lower.` },
          { key: 'hold', label: 'Stay the course', cost: 0, desc: `Keep flying as planned. Cities in ${where} remember loyalty: relations +6.` },
        ],
      };
    }
    s.crisis.id = s.turn;
  };
  // Temporary capacity cuts end on their own; flights return if slots and aircraft still allow it.
  G.restoreCuts = function (s, rep) {
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
    A.cash -= o.cost;
    const rs = G.routesOf(s, 0);
    const inside = r => c.world || (c.region ? [r.a, r.b].some(x => CITY[x].region === c.region) : [r.a, r.b].includes(c.city));
    if (key === 'surcharge') { rs.forEach(r => (r.fare = Math.min(50, r.fare + 10))); A.sat = Math.max(0, (A.sat ?? 50) - 6); }
    if (key === 'retrofit') A.fuelSave = { mult: 0.92, left: 8 };
    if (key === 'absorb') new Set(rs.flatMap(r => [r.a, r.b])).forEach(x => G.addRel(s, 0, x, 4));
    if (key === 'cut') rs.filter(inside).forEach(r => { r.cutFrom = { freq: r.freq, left: 2 }; r.freq = Math.max(1, Math.round(r.freq * 0.7)); });
    if (key === 'promo') {
      const regs = c.world ? REGIONS.map(R => R.id) : [c.region || CITY[c.city].region];
      regs.forEach(region => A.ads.push({ region, boost: 0.2, left: 2 }));
      rs.filter(inside).forEach(r => (r.fare = Math.max(-50, r.fare - 10)));
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
    const idle = G.idleTotal(s, 0);
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
    regional: { name: 'Regional champion', blurb: 'Dominate your home region: lead it and a neighbour, serve 20 cities there, stay profitable.' },
    premium: { name: 'Premium airline', blurb: 'The best-loved airline: satisfaction 75+, a 12% margin and hubs in four regions.' },
    lowcost: { name: 'Low-cost network', blurb: 'Carry more passengers than any rival at an average fare at least 10% below standard, at a profit.' },
    value: { name: 'Most valuable', blurb: 'Be the most valuable airline when the clock runs out.' },
  };
  // Progress toward the game's objective, as a checklist the UI can show.
  G.objectiveChecks = function (s, i, useLast) {
    const A = s.airlines[i], g = G.goalStatus(s, i, useLast), obj = s.goal || 'world', yr = useLast ? A.lastYr : A.yr;
    const homeR = CITY[A.home].region, rs = G.routesOf(s, i);
    const fmt = v => G.fmtM(v);
    if (obj === 'world') return [
      { label: 'Regions with a hub', val: `${g.hubRegions.length}/7`, ok: g.hubRegions.length === REGIONS.length },
      { label: 'Regions you lead', val: `${g.leads.length}/${s.difficulty}`, ok: g.leads.length >= s.difficulty },
      { label: 'Lead your home region', val: g.homeLead ? 'Yes' : 'No', ok: g.homeLead },
      { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
    ];
    if (obj === 'regional') {
      const cities = new Set(rs.flatMap(r => [r.a, r.b]).filter(c => CITY[c].region === homeR)).size;
      return [
        { label: `Lead ${REGION[homeR].name}`, val: g.homeLead ? 'Yes' : 'No', ok: g.homeLead },
        { label: 'Regions you lead', val: `${g.leads.length}/2`, ok: g.leads.length >= 2 },
        { label: `Cities served in ${REGION[homeR].name}`, val: `${cities}/20`, ok: cities >= 20 },
        { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
      ];
    }
    if (obj === 'premium') {
      const f = A.score || {};
      return [
        { label: 'Satisfaction', val: `${Math.round(A.sat ?? 50)}/75`, ok: (A.sat ?? 50) >= 75 },
        { label: 'Profit margin (last quarter)', val: `${Math.round((f.margin || 0) * 100)}%/12%`, ok: (f.margin || 0) >= 0.12 },
        { label: 'Regions with a hub', val: `${g.hubRegions.length}/4`, ok: g.hubRegions.length >= 4 },
        { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
      ];
    }
    if (obj === 'lowcost') {
      const yrOf = j => (useLast ? s.airlines[j].lastYr : s.airlines[j].yr);
      const tot = j => (yrOf(j) ? Object.values(yrOf(j).pax).reduce((t, v) => t + v, 0) : 0);
      const mine = tot(i), most = s.airlines.every((B, j) => j === i || B.bankrupt || tot(j) < mine);
      const w = rs.reduce((t, r) => t + (r.last ? r.last.pax : 0), 0) || 1;
      const avgFare = rs.reduce((t, r) => t + r.fare * (r.last ? r.last.pax : 0), 0) / w;
      return [
        { label: 'Most passengers worldwide', val: most ? 'Yes' : 'No', ok: most && mine > 0 },
        { label: 'Average fare', val: `${avgFare >= 0 ? '+' : ''}${Math.round(avgFare)}% / −10%`, ok: avgFare <= -10 },
        { label: 'Profit this year', val: fmt(g.profit), ok: g.profit > 0 },
      ];
    }
    const vals = s.airlines.map((B, j) => (B.bankrupt ? 0 : G.companyValue(s, j)));
    const top = vals.every((v, j) => j === i || v < vals[i]);
    return [
      { label: 'Company value', val: fmt(vals[i]), ok: top },
      { label: 'Most valuable airline', val: top ? 'Yes' : 'No', ok: top },
    ];
  };
  // Year-end win test for the chosen objective. "value" is only decided when time runs out.
  G.objectiveWon = (s, i) => (s.goal || 'world') !== 'value' && G.objectiveChecks(s, i).every(c => c.ok);

  // ---------- scenarios ----------
  G.SCENARIOS = [
    { id: 'oil73', name: 'The Oil Shock', start: 1973, era: 1970, years: 5, home: 'LHR', goal: 'value', cash: 220,
      blurb: 'Autumn 1973: the embargo is weeks away. Steer a London airline through it and come out the most valuable.' },
    { id: 'dereg78', name: 'Deregulation', start: 1978, era: 1970, years: 5, home: 'ORD', goal: 'regional', cash: 240,
      blurb: 'American skies open up. Build the champion of North America from Chicago.' },
    { id: 'asia90', name: 'Asian Tigers', start: 1990, era: 1985, years: 6, home: 'HKG', goal: 'lowcost', cash: 300,
      blurb: 'Asia is booming. Carry more people than anyone with cheap fares out of Hong Kong.' },
    { id: 'gulf00', name: 'Desert Super-hub', start: 2000, era: 2000, years: 6, home: 'DXB', goal: 'premium', cash: 360,
      blurb: 'Turn Dubai into the world\'s favourite connecting point with a premium product.' },
    { id: 'crisis01', name: 'Crisis Decade', start: 2001, era: 2000, years: 5, home: 'JFK', goal: 'value', cash: 320,
      blurb: 'Terror, SARS and soaring oil, back to back. Survive and outgrow your rivals.' },
  ];
  G.SCENARIO = Object.fromEntries(G.SCENARIOS.map(x => [x.id, x]));
})(globalThis.G);
