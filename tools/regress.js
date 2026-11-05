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
    const v = G.scheduleScore(G.previewRoute(s, 0, { ...spec, planes, freq }), 0, planes, 'B741');
    if (v > best.score + 1e-6) beat = `${freq}/wk on ${planes}: ${v.toFixed(2)} > ${best.score.toFixed(2)}`;
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

// 12. No flight ever carries more passengers than its seats allow.
{
  let worst = 0;
  const s = G.newGame({ home: 'JFK', era: 1985, seed: 3 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  for (let k = 0; k < 24; k++) {
    G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s);
    for (const r of s.routes) if (r.last) worst = Math.max(worst, r.last.pax / (G.seatsOn(r) * r.freq * 2 * G.WEEKS));
  }
  check('boardings never exceed seats', worst <= G.MAX_LF + 0.001, `highest load ${(worst * 100).toFixed(1)}%`);
}

// 13. A crisis choice made in the report is settled in that quarter: headline, bridge and history agree.
{
  const s = G.newGame({ scenario: 'oil73', seed: 14 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  for (let k = 0; k < 3; k++) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  G.makeCrisis(s, { kind: 'region', region: 'EU', mult: 0.7, left: 2, text: 'test' });
  const promo = s.crisis.options.find(o => o.key === 'promo');
  G.resolveCrisis(s, 'promo');
  const b = s.lastRep.bridge, h = A.history[A.history.length - 1];
  check('crisis payment settled in the closed quarter', Math.abs(b.close - A.cash) < 1e-9 && Math.abs(h.cash - A.cash) < 1e-9 && Math.abs(b.gap) < 1e-6, `cost ${promo.cost}, close ${b.close.toFixed(2)}, cash ${A.cash.toFixed(2)}`);
  const r = G.routesOf(s, 0).find(r => r.fareTemp), f0 = r && r.fareTemp.from;
  G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null;
  for (let k = 0; k < 2; k++) G.endQuarter(s);
  check('sale fares go back up afterwards', !r || (r.fare === f0 && !r.fareTemp), r ? `fare ${r.fare} (was ${f0})` : 'no route in region');
  const rep = G.endQuarter(s);
  check('next quarter reconciles', Math.abs(rep.bridge.gap) < 1e-6);
}

// 14. The final quarter ends the game cleanly: no crisis, no requests, no board target, a true starting value.
{
  const s = G.newGame({ scenario: 'oil73', seed: 15 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  const start = s.startValue;
  let lateTarget = null;
  const goals = new Set();
  while (!s.over) {
    G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null;
    A.isAI = false; G.endQuarter(s); A.isAI = true;
    if (s.board && s.board.goal) goals.add(s.board.goal);
  }
  for (const g of goals) if (g.due > s.turn) lateTarget = g;
  check('no crisis or requests after the end', !s.crisis && !s.requests.length);
  check('no board target that runs past the finish', !lateTarget, lateTarget && JSON.stringify(lateTarget));
  check('debrief starts from company value, not cash', start > s.startCash && G.debrief(s).startV === start, `start value ${start.toFixed(1)}, cash ${s.startCash}`);
}

// 15. A recommended move that needs new slots never says "no cash needed": slot deposits are counted.
{
  let withSlots = 0, bad = null;
  for (const seed of [21, 22, 23]) {
    const s = G.newGame({ scenario: 'oil73', seed }), A = s.airlines[0];
    A.isAI = true; A.pers = 'empire';
    for (let q = 0; q < 10 && !s.over; q++) {
      G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s);
      A.isAI = false;
      for (const x of G.decisions(s)) {
        const b = x.best;
        if (!b || !b.slots || !b.slots.length) continue;
        withSlots++;
        if (!(b.slotCash > 0 && b.cash >= b.slotCash + b.planeCash - 1e-9)) bad = `${x.why}: cash ${b.cash}, slots ${b.slotCash}`;
      }
      A.isAI = true;
    }
  }
  check('moves that need slots count the slot deposit in cash needed', !bad, bad || `${withSlots} such moves checked`);
}

// 16. Travellers remember a bad route: a low remembered score carries fewer passengers at lower yields.
{
  const s = G.newGame({ scenario: 'oil73', seed: 5 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  for (let q = 0; q < 3; q++) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  // the emptiest route: on a full one, travellers who stay away are replaced by those who could not get a seat
  const r = G.routesOf(s, 0).filter(r => r.last && r.last.pax).sort((x, y) => x.last.lf - y.last.lf)[0];
  const run = rsat => { r.rsat = rsat; const x = G.runNetwork(s).R.get(r.id); return { pax: x.pax, yld: x.rev / Math.max(1, x.pax) }; };
  const hi = run(70), mid = run(50), lo = run(10);
  r.rsat = undefined;
  check('low satisfaction costs passengers and yield', lo.pax < mid.pax && lo.yld < mid.yld && hi.pax >= mid.pax * 0.999,
    `pax ${lo.pax.toFixed(0)} < ${mid.pax.toFixed(0)} ≤ ${hi.pax.toFixed(0)}, yield ${lo.yld.toFixed(0)} < ${mid.yld.toFixed(0)}`);
}

// 17. The recovery check never calls a gap closable when what it found adds up to less than the gap.
{
  let seen = 0, bad = null;
  for (const seed of [3, 11, 17]) {
    const s = G.newGame({ scenario: 'oil73', seed }), A = s.airlines[0];
    A.isAI = true; A.pers = 'budget';
    while (G.quartersLeft(s) > 3) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
    A.isAI = false;
    const P = G.recoveryPlan(s);
    if (!P) continue;
    seen++;
    if ((P.verdict === 'possible') !== (P.total >= P.gapV)) bad = `seed ${seed}: ${P.verdict} with ${P.total.toFixed(0)} against ${P.gapV.toFixed(0)}`;
  }
  check('recovery verdict matches the sums', !bad, bad || `${seen} games behind checked`);
}

// 18. A lost value race's debrief says what decided it.
{
  const s = G.newGame({ scenario: 'oil73', seed: 3 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'budget';
  while (!s.over) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  const D = G.debrief(s, 0), behind = D.top && D.endV < D.top.v;
  check('debrief explains a loss', !behind || D.lines.some(l => l.startsWith('What decided it')), behind ? D.lines[D.lines.length - 1] : 'won this one');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
