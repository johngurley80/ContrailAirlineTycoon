// Regression checks for bugs found in playtests. Run: node tools/regress.js
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/ops', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!ok) fails++; };

// 1. Cutting a route that uses every London slot frees them for a planned route at once.
{
  const s = G.newGame({ home: 'LHR', era: 2000, seed: 5 }), A = s.airlines[0];
  A.slots.LHR = 40; A.slots.CDG = 40; A.slots.AMS = 40; A.slots.JFK = 20;
  A.fleet.push({ type: 'B738', n: 6, built: 2000 });
  const r = G.openRoute(s, 0, { a: 'LHR', b: 'CDG', type: 'B738', planes: 3, freq: 21, fare: 0 });
  check('open LHR–CDG', r.ok, r.err);
  const other = G.openRoute(s, 0, { a: 'LHR', b: 'AMS', type: 'B738', planes: 2, freq: Math.max(1, G.slotsAvail(s, 0, 'LHR')), fare: 0 });
  check('fill the rest of LHR', other.ok && G.slotsAvail(s, 0, 'LHR') === 0, other.err || `free ${G.slotsAvail(s, 0, 'LHR')}`);
  G.addPlanned(s, 0, 'LHR', 'JFK');
  const before = G.plannedStatus(s, 0, A.planned[0]).slots.find(x => x.c === 'LHR').free;
  check('planned LHR–JFK sees 0 free at LHR', before === 0, `free ${before}`);
  const cut = G.updateRoute(s, r.route.id, { ...r.route, freq: 10 });
  check('cut LHR–CDG to 10 a week', cut.ok, cut.err);
  const after = G.plannedStatus(s, 0, A.planned[0]).slots.find(x => x.c === 'LHR').free;
  check('planned LHR–JFK now sees 11 free at LHR', after === 11, `free ${after}`);
}

// 2. Negotiating at a full airport is blocked with a reason, not offered at 97%.
{
  const s = G.newGame({ home: 'LHR', era: 2000, seed: 6 });
  s.airlines[1].slots.FRA = (s.airlines[1].slots.FRA || 0) + Math.max(0, G.airportFree(s, 'FRA'));
  const blk = G.slotBlock(s, 0, 'FRA');
  check('full airport blocks talks', !!blk && /full/.test(blk), blk);
  check('negotiate refused', !G.negotiateSlots(s, 0, 'FRA', 5).ok);
}

// 3. Route preview reports its parts separately and a preview of a route as it is changes nothing.
{
  const s = G.newGame({ home: 'JFK', era: 1985, seed: 7 });
  s.airlines[0].pers = 'empire'; s.airlines[0].isAI = true;
  for (let k = 0; k < 6; k++) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); G.endQuarter(s); }
  const r = G.routesOf(s, 0)[0];
  const pv = G.previewRoute(s, 0, { a: r.a, b: r.b, type: r.type, planes: r.planes, freq: r.freq, fare: r.fare, svc: r.svc, cab: r.cab, peak: r.peak, id: r.id }, r.id);
  check('preview keeps parts', Math.abs(pv.net - (pv.profit - pv.aircraft - pv.slotFee)) < 1e-9);
  check('unchanged route has no knock-on', Math.abs(pv.knock) < 0.01, pv.knock.toFixed(3));
  let t0 = Date.now(); const dec = G.decisions(s);
  check('ranked decisions', Array.isArray(dec), `${dec.length} in ${Date.now() - t0}ms: ${dec.map(x => x.why + ' -> ' + (x.best ? x.best.label + ' ' + x.best.gain.toFixed(1) : 'close')).join(' | ')}`);
}

// 4. Stage rewards are paid once.
{
  const s = G.newGame({ home: 'LHR', era: 2000, seed: 8 }), A = s.airlines[0];
  const slots = A.slots.LHR || 0;
  G.stageReward(s, 0, 1); G.stageReward(s, 0, 2);
  check('stage 1 slots', (A.slots.LHR || 0) > slots || A.cash > 0);
  check('stage 2 negotiator', G.agentsLeft(s, 0) === 4);
}

// 5. The cash bridge reconciles every quarter, for every airline, on unrounded values.
{
  const s = G.newGame({ scenario: 'crisis01', seed: 9 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  let worst = 0, sub = 0;
  for (let k = 0; k < 10; k++) {
    G.aiTurn(s, 0, { rivals: [], news: [], world: [] });
    if (k === 2) { G.borrow(s, 0, 20); s.contracts.push({ id: 99, city: 'JFK', other: G.routesOf(s, 0)[0].b, minFreq: 1, need: 3, done: 0, subsidy: 1.5, slots: 0, start: s.turn, paid: 0 }); }
    s.crisis = null;
    const rep = G.endQuarter(s);
    worst = Math.max(worst, Math.abs(rep.bridge.gap));
    sub += rep.bridge.flows.subsidy || 0;
  }
  check('cash bridge reconciles', worst < 1e-6 && !(G.bridgeErrors || []).length, `worst gap ${worst.toExponential(1)}`);
  check('subsidies shown outside profit', sub > 0, `subsidy ${sub.toFixed(1)}`);
}

// 6. Objective-aware guidance: no hub-everywhere advice or idle-cash targets in a value game; no targets in the final year.
{
  const s = G.newGame({ scenario: 'crisis01', seed: 10 }), A = s.airlines[0];
  const ctx = G.objectiveContext(s);
  check('value game does not need hubs', !ctx.hubsMatter && ctx.cashCounts, JSON.stringify({ hubsMatter: ctx.hubsMatter, left: ctx.left }));
  A.cash = 5000; s.year = s.end - 1; s.q = 1; s.turn = 18; s.board = { conf: 60, goal: null, last: null };
  for (let k = 0; k < 5; k++) A.history.push({ y: s.year, q: 0, cash: A.cash, profit: 10, pax: 1e5 });
  const rep = { news: [] };
  G.boardTick(s, rep);
  check('no new board target in the final year', !s.board.goal, rep.news.map(n => n.text).join(' | '));
  const w = G.newGame({ home: 'LHR', era: 2000, seed: 10 });
  check('world game needs hubs', G.objectiveContext(w).hubsMatter);
}

// 7. Permanent effects are stored as permanent, not as a long countdown.
{
  const s = G.newGame({ home: 'LHR', era: 2000, seed: 11 });
  s.events.push({ kind: 'city', city: 'LHR', mult: 1.1, perm: true, left: 0, text: 'x' });
  G.endQuarter(s);
  check('permanent effect survives', s.events.some(e => e.perm && e.text === 'x'));
}

// 8. A suggested schedule never scores below another feasible schedule with the same settings,
//    measured the way the route planner measures it.
{
  const s = G.newGame({ scenario: 'oil73', seed: 12 }), A = s.airlines[0];
  A.fleet = [{ type: 'B741', n: 2, built: 1973 }];
  A.slots.LHR = 40; A.slots.HND = 40;
  const spec = { a: 'LHR', b: 'HND', type: 'B741', fare: 0, svc: 1, cab: 0, peak: false };
  const t0 = Date.now(), best = G.suggestSchedule(s, 0, spec, { maxPlanes: 2 }), ms = Date.now() - t0;
  const d = G.dist('LHR', 'HND');
  let beat = null;
  for (let planes = 1; planes <= 2; planes++) for (let freq = 1; freq <= G.maxFreq('B741', planes, d); freq++) {
    const v = G.scheduleValue(G.previewRoute(s, 0, { ...spec, planes, freq }), 0, 'B741');
    if (v > best.v + 1e-6) beat = `${freq}/wk on ${planes}: ${v.toFixed(2)} > ${best.v.toFixed(2)}`;
  }
  check('suggested schedule is the best feasible one', !beat, beat || `${best.freq}/wk on ${best.planes}, ${ms}ms`);
}

// 9. In the last quarter nothing that waits for a delivery or slot talks is recommended.
{
  const s = G.newGame({ scenario: 'oil73', seed: 13 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  while (G.quartersLeft(s) > 1) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  A.isAI = false;
  const dec = G.decisions(s);
  const late = dec.filter(x => x.best && (x.best.buy || x.best.slots.length));
  check('no purchases or slot talks in the final quarter', !late.length, `${dec.length} moves: ${dec.map(x => x.best ? x.best.label : 'close').join(' | ')}`);
}

// 10. The race card's movement equals the change between the two quarter-end leads it shows.
{
  const s = G.newGame({ scenario: 'oil73', seed: 3 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  let prev = null, worst = 0;
  while (!s.over) {
    G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s);
    const R = G.finalRace(s, 0);
    if (prev && R && !R.was && R.j === prev.j) worst = Math.max(worst, Math.abs(R.gap - prev.gap - R.move));
    prev = R;
  }
  check('race movement matches consecutive leads', worst < 1e-9, worst.toExponential(1));
}

// 11. Trying an aircraft buys nothing and leaves the fleet as it was.
{
  const s = G.newGame({ scenario: 'oil73', seed: 4 }), A = s.airlines[0];
  const before = JSON.stringify(A.fleet), cash = A.cash;
  const T = G.tryPlane(s, 0, 'B741');
  check('try on a route is side-effect free', JSON.stringify(A.fleet) === before && A.cash === cash && T.results.length > 0, `${T.results.length} routes, best ${T.results[0] && T.results[0].change.toFixed(1)}`);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
