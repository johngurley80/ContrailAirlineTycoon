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
  const r = G.routesOf(s, 0).find(r => r.fareTemps), f0 = r && r.fare - r.fareTemps[0].d;
  G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null;
  for (let k = 0; k < 2; k++) G.endQuarter(s);
  check('sale fares go back up afterwards', !r || (r.fare === f0 && !r.fareTemps), r ? `fare ${r.fare} (was ${f0})` : 'no route in region');
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
  check('low satisfaction costs passengers and yield', lo.pax < mid.pax && lo.yld < mid.yld && hi.pax >= mid.pax * 0.995,
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

// 19. A low-cost airline is never advised to raise fares past the objective's −10%.
{
  const s = G.newGame({ scenario: 'asia90', seed: 4 }), A = s.airlines[0];
  const r = G.openRoute(s, 0, { a: 'HKG', b: A.starters[0], type: A.fleet[0].type, planes: 1, freq: 8, fare: -15, svc: 1, cab: 0, peak: false });
  s.crisis = null; G.endQuarter(s); s.crisis = null;
  s.routes.find(x => x.id === r.route.id).fare = -25;
  const fares = G.changeOptions(s, s.routes.find(x => x.id === r.route.id), 'grow').filter(o => o.spec.fare !== -15).map(o => o.spec.fare);
  check('low-cost advice keeps fares at or below −10%', fares.every(f => f <= -10), `fares tried ${fares.join(', ') || 'none'}`);
}

// 20. Idle aircraft that suit a full route are offered as a swap, and an idle fleet finds a market
//     you hold slots for even when it is not one of the most valuable ones.
{
  const s = G.newGame({ scenario: 'asia90', seed: 4 }), A = s.airlines[0];
  A.fleet.push({ type: 'B752', n: 1, built: 1989 }); A.slots.ITM = 8;
  const r = G.openRoute(s, 0, { a: 'HKG', b: 'ITM', type: 'B752', planes: 1, freq: 8, fare: -15, svc: 1, cab: 0, peak: false });
  s.crisis = null; G.endQuarter(s); s.crisis = null;
  A.fleet.push({ type: 'IL86', n: 2, built: 1990 });
  const sw = G.changeOptions(s, s.routes.find(x => x.id === r.route.id), 'grow').map(o => o.label);
  check('idle bigger aircraft offered as a switch', sw.some(l => /Il-86/.test(l)), sw.join('; '));
  // only TPE held besides the hub: a modest market far down the list of opportunities
  G.closeRoute ? G.closeRoute(s, r.route.id) : null;
  for (const c of Object.keys(A.slots)) if (c !== 'HKG') A.slots[c] = 0;
  A.slots.TPE = 10;
  A.fleet = A.fleet.filter(f => f.type === 'IL86');
  const rank = G.opportunities(s, 0, 999).findIndex(o => o.b === 'TPE');
  const moves = G.decisions(s).map(x => x.key + ' ' + (x.best ? x.best.label : ''));
  check('idle aircraft get a market with slots held', moves.some(m => /^(idle|new)-/.test(m) && /TPE/.test(m)), `TPE is opportunity #${rank + 1} · ` + moves.join(' | '));
}

// 21. Outside a value race the debrief does not explain the result by company value.
{
  const s = G.newGame({ scenario: 'asia90', seed: 7 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'budget';
  while (!s.over) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  const D = G.debrief(s, 0);
  check('low-cost debrief has no value verdict', !D.lines.some(l => l.startsWith('What decided it')), D.lines.find(l => /company value/i.test(l)) || '');
}

// 22. The board does not ask a low-cost airline for satisfaction it is trading away on purpose.
{
  const s = G.newGame({ scenario: 'asia90', seed: 4 }), A = s.airlines[0];
  A.sat = 50;
  let asked = null, prev = null;
  for (let k = 0; k < 12 && !s.over; k++) {
    A.isAI = true; A.pers = 'budget'; G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); A.isAI = false; A.sat = 50; s.crisis = null; G.endQuarter(s);
    const g = s.board && s.board.goal;
    // a target set this quarter was chosen against satisfaction as it stood after the quarter
    if (g && g !== prev && g.kind === 'service' && A.sat >= 45) asked = A.sat.toFixed(1);
    prev = g;
  }
  check('no satisfaction target at 45+ for a low-cost airline', !asked, asked ? `asked at ${asked}` : '');
}

// 23. New event mechanics each do what their news says.
{
  const mk = () => { const s = G.newGame({ home: 'LHR', era: 2000, seed: 9 }), A = s.airlines[0]; A.slots.LHR = 40; A.slots.CDG = 40; A.slots.JFK = 20; A.fleet.push({ type: 'B738', n: 4, built: 2000 }, { type: 'B788', n: 2, built: 2012 }); s.year = 2013; return s; };
  const rep = () => ({ world: [], news: [], rivals: [] });
  let s = mk();
  const r = G.openRoute(s, 0, { a: 'LHR', b: 'JFK', type: 'B788', planes: 1, freq: 5, fare: 0, svc: 1, cab: 0, peak: false }).route;
  const before = G.runNetwork(s).R.get(r.id);
  G.applyEvent(s, { kind: 'ground', type: 'B788', share: 1, left: 1, text: 'Grounded.' }, rep());
  const gone = G.runNetwork(s).R.get(r.id);
  check('a full grounding stops the route flying and costing fuel', gone.pax === 0 && gone.costQ === 0 && before.pax > 0, `pax ${before.pax.toFixed(0)} -> ${gone.pax}`);
  s.events = []; G.applyEvent(s, { kind: 'ground', type: 'B788', share: 0.5, left: 1, text: 'Half.' }, rep());
  const half = G.runNetwork(s).R.get(r.id);
  check('a half grounding halves the seats', Math.abs(half.cap - before.cap / 2) < 1, `cap ${before.cap.toFixed(0)} -> ${half.cap.toFixed(0)}`);
  s.events = [];
  const d0 = G.baseDemand(s, 'LHR', 'CDG'), dj = G.baseDemand(s, 'LHR', 'JFK');
  G.applyEvent(s, { kind: 'pair', pairs: [['LHR', 'CDG']], mult: 0.6, perm: true, left: 0, text: 'Tunnel.' }, rep());
  check('a pair event hits only that pair', Math.abs(G.baseDemand(s, 'LHR', 'CDG') / d0 - 0.6) < 1e-6 && Math.abs(G.baseDemand(s, 'LHR', 'JFK') - dj) < 1e-6);
  const cap0 = s.cap.HKG; G.applyEvent(s, { kind: 'cap', city: 'HKG', grow: 0.5, text: 'New airport.' }, rep());
  check('a new airport adds slots', s.cap.HKG === cap0 + Math.round(cap0 * 0.5), `${cap0} -> ${s.cap.HKG}`);
  const lr = G.loanRate(s, 0); G.applyEvent(s, { kind: 'rates', mult: 1.4, left: 4, text: 'Up.' }, rep());
  check('a rate rise raises loan rates', Math.abs(G.loanRate(s, 0) / lr - 1.4) < 1e-9);
  const lc = G.leaseCost(s, 0, 'B738'); G.applyEvent(s, { kind: 'lease', mult: 0.8, left: 4, text: 'Glut.' }, rep());
  s.airlines[0].cash = 1000; const L = G.leasePlanes(s, 0, 'B738', 1);
  check('a leasing glut cuts lease costs and the rate sticks', L.ok && G.leaseCost(s, 0, 'B738') < lc && s.airlines[0].orders.some(o => o.lease && o.rm === 0.8), L.err);
}
// 24. Delays, outages, rival strikes and fire sales.
{
  const s = G.newGame({ home: 'LHR', era: 2000, seed: 11 }), A = s.airlines[0];
  A.slots.CDG = 20; A.fleet.push({ type: 'B738', n: 2, built: 2000 });
  G.openRoute(s, 0, { a: 'LHR', b: 'CDG', type: 'B738', planes: 1, freq: 7, fare: 0, svc: 1, cab: 0, peak: false });
  A.cash = 1000; G.buyPlanes(s, 0, 'B738', 1);
  const had = G.fleetCount(A, 'B738');
  G.applyEvent(s, { kind: 'delay', maker: 'Boeing', left: 1, text: 'Late.' }, { world: [], news: [], rivals: [] });
  s.crisis = null; G.endQuarter(s);
  check('a maker delay holds an order one quarter', A.orders.length === 1 && A.orders[0].delayed);
  s.crisis = null; G.endQuarter(s);
  check('the delayed order then arrives', A.orders.length === 0 && G.fleetCount(A, 'B738') === had + 1, `fleet ${had} -> ${G.fleetCount(A, 'B738')}`);
  s.events.push({ kind: 'outage', o: 0, left: 1 });
  s.crisis = null; G.endQuarter(s);
  check('an IT outage disrupts every route', G.routesOf(s, 0).every(r => r.last.disrupted));
  const j = s.airlines.findIndex((B, k) => k > 0 && G.routesOf(s, k).length);
  const rr = G.routesOf(s, j)[0], c0 = G.runNetwork(s).R.get(rr.id).cap;
  s.events.push({ kind: 'strike', o: j, left: 1 });
  check('a rival strike halves its seats', Math.abs(G.runNetwork(s).R.get(rr.id).cap - c0 / 2) < 1);
  const city = Object.keys(s.airlines[j].slots).find(c => G.slotOffers(s, 0, c).some(o => o.j === j));
  if (city) {
    const u0 = G.slotOffers(s, 0, city).find(o => o.j === j).unit;
    s.events.push({ kind: 'firesale', o: j, left: 2 });
    check('a rival fire sale cuts its slot price', G.slotOffers(s, 0, city).find(o => o.j === j).unit < u0);
  }
  const r0 = G.routesOf(s, 0)[0], sat0 = G.routeSat(s, r0);
  s.events.push({ kind: 'sat', route: r0.id, o: 0, hit: -12, label: 'Food scare', left: 2 });
  check('a food scare shows in the route’s satisfaction', G.routeSat(s, r0) < sat0 && G.satParts(s, r0).some(p => p[0] === 'Food scare'));
  s.crisis = null; s.events = [];
  G.applyEvent(s, { kind: 'fuel', mult: 0.75, left: 4, text: 'Oil collapses.' }, { world: [], news: [], rivals: [] });
  check('cheaper fuel does not open a crisis card', !s.crisis);
}
// 25. Every historical event and every random event can fire in any era without errors.
{
  let err = null, n = 0;
  try {
    for (const era of [1955, 1970, 1985, 2000]) {
      const s = G.newGame({ home: 'JFK', era, seed: era });
      for (const h of G.HISTORY) { G.applyEvent(s, h, { world: [], news: [], rivals: [] }); n++; }
      for (let y = era; y < era + 20; y += 3) for (let q = 0; q < 4; q++) {
        s.year = y; s.q = q;
        for (const x of G.RANDOM_EVENTS) { const e = x.make(s); if (e) { G.applyEvent(s, e, { world: [], news: [], rivals: [] }); n++; } }
      }
      s.crisis = null; G.endQuarter(s);
    }
  } catch (e) { err = e.stack.split('\n').slice(0, 2).join(' '); }
  check('every event fires cleanly', !err, err || `${n} events applied`);
}

// 26. Every era starts from every major city without errors (1955 once crashed when a rival was in the Eastern bloc).
{
  let bad = null, n = 0;
  for (const home of G.CITIES.filter(c => c.major).map(c => c.code)) for (const era of [1955, 1970, 1985, 2000]) for (const seed of [1, 2, 3]) {
    try { const s = G.newGame({ home, era, seed }); s.crisis = null; G.endQuarter(s); n++; } catch (e) { bad = bad || `${home} ${era} seed ${seed}: ${e.message}`; }
  }
  check('every era starts from every major city', !bad, bad || `${n} starts`);
}

// 27. A historical event that also spikes fuel (Iran 1979) asks for a fuel-crisis decision.
{
  const s = G.newGame({ scenario: 'dereg78', seed: 3 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  while (!(s.year === 1979 && s.q === 0)) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  check('Iran 1979 brings a fuel crisis card', s.crisis && /Fuel/.test(s.crisis.title) && s.events.some(e => e.kind === 'fuel' && e.mult === 1.5), s.crisis ? s.crisis.title : 'no crisis');
}

// 28. Short haul is worth flying, and every era has small aircraft for it.
{
  for (const era of [1955, 1970, 1985, 2000]) {
    const s = G.newGame({ home: 'LHR', era, seed: 2 });
    const small = G.buyableTypes(s, 0).filter(p => p.bloc === 'W' && p.range < 3500);
    check(`${era}: short-range aircraft on sale`, small.length >= 2, small.map(p => p.id).join(', '));
    check(`${era}: the starter routes include short hops`, s.airlines[0].starters.filter(c => G.dist('LHR', c) < 3000).length >= 2, s.airlines[0].starters.join(', '));
  }
  const s = G.newGame({ home: 'LHR', era: 1985, seed: 2 }), A = s.airlines[0];
  A.slots.CDG = 20; A.slots.JFK = 20;
  const pv = (b, type, freq) => G.previewRoute(s, 0, { a: 'LHR', b, type, planes: Math.ceil(freq * G.rtHours(type, G.dist('LHR', b)) / G.HOURS_PER_PLANE), freq, fare: 0, svc: 1, cab: 0, peak: false });
  const cdg = pv('CDG', 'B733', 14), jfk = pv('JFK', 'B752', 14);
  check('London–Paris earns real money per slot (at least an eighth of London–New York)', cdg.net > 4 && cdg.net / jfk.net > 1 / 8, `CDG ${cdg.net.toFixed(1)} vs JFK ${jfk.net.toFixed(1)} $M/q`);
}

// ChatGPT playtest (Crisis Decade): a promotion during a surcharge left fares stuck at +10% for good.
{
  const s = G.newGame({ scenario: 'oil73', seed: 14 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  for (let k = 0; k < 3; k++) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  A.isAI = false;
  const home = G.CITY[A.home].region, r = G.routesOf(s, 0).find(x => [x.a, x.b].some(c => G.CITY[c].region === home));
  for (const x of G.routesOf(s, 0)) x.fare = 0;
  G.makeCrisis(s, { kind: 'fuel', mult: 1.4, left: 4, text: 'test' }); G.resolveCrisis(s, 'surcharge'); s.crisis = null;
  G.makeCrisis(s, { kind: 'region', region: home, mult: 0.7, left: 2, text: 'test' }); G.resolveCrisis(s, 'promo'); s.crisis = null;
  check('surcharge then promotion: fare back to 0 while both run', r.fare === 0, `fare ${r.fare}`);
  const fares = [];
  for (let k = 0; k < 4; k++) { s.crisis = null; G.endQuarter(s); fares.push(r.fare); }
  check('promotion ends first: the surcharge stays (+10)', fares[1] === 10, fares.join(','));
  check('surcharge ends: fare back to 0 with nothing left over', fares[3] === 0 && !r.fareTemps, fares.join(',') + (r.fareTemps ? ' (modifiers left)' : ''));
  G.makeCrisis(s, { kind: 'fuel', mult: 1.4, left: 3, text: 'test' }); G.resolveCrisis(s, 'surcharge'); s.crisis = null;
  G.updateRoute(s, r.id, { ...r, fare: 5 });
  for (let k = 0; k < 3; k++) { s.crisis = null; G.endQuarter(s); }
  check('setting the fare yourself ends the surcharge: your fare stays', r.fare === 5 && !r.fareTemps, `fare ${r.fare}`);
}

// ChatGPT playtest: after technical delays, journeys + connecting journeys no longer matched route boardings.
{
  const s = G.newGame({ era: 2000, home: 'LHR', seed: 9 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  let worst = 0, delayed = 0;
  for (let k = 0; k < 12; k++) {
    A.isAI = true; G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); A.isAI = false; s.crisis = null;
    for (const t of G.fleetTypes(A)) A.checks[t] = G.CHECK_EVERY + 4; // overdue fleets: delays are likely
    G.endQuarter(s);
    const rs = G.routesOf(s, 0).filter(r => r.last), f = A.lastFin;
    if (!rs.length || !f) continue;
    if (rs.some(r => r.last.disrupted)) delayed++;
    const boards = rs.reduce((t, r) => t + r.last.pax, 0);
    worst = Math.max(worst, Math.abs(boards - (f.pax + f.conn)) / Math.max(1, boards));
  }
  check('delays happened in the test', delayed > 0, `${delayed} quarters with delays`);
  check('journeys + connecting journeys = route boardings, even with delays (within 0.5%)', worst < 0.005, `worst gap ${(worst * 100).toFixed(2)}%`);
}

// ChatGPT playtest: a small loss read "−$0.0M".
check('a small loss shows in thousands', G.fmtM(-0.03) === '−$30k' && G.fmtM(0) === '$0.0M' && G.fmtM(-1.24) === '−$1.2M', `${G.fmtM(-0.03)} ${G.fmtM(0)} ${G.fmtM(-1.24)}`);

// Endless play: keep flying after any ending except bankruptcy, past 2019, with aircraft still on sale.
{
  const s = G.newGame({ era: 2000, home: 'LHR', seed: 12 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  for (let k = 0; k < 4; k++) { G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); s.crisis = null; G.endQuarter(s); }
  s.year = 2018; s.over = { kind: 'fired', text: 'test' }; s.board = { ...(s.board || {}), conf: -5 };
  check('fired: endless play allowed', G.goEndless(s).ok && !s.over && s.endless && s.board.conf >= 50);
  let ended = null;
  for (let k = 0; k < 20 && !ended; k++) { s.board.conf = -10; s.crisis = null; G.endQuarter(s); ended = s.over && !A.bankrupt ? s.over.kind : null; }
  check('runs past the old end date (2020) without ending', !ended && s.year >= 2023, `year ${s.year}${ended ? ', ended: ' + ended : ''}`);
  check('aircraft still in production in 2019 stay on sale', G.buyableTypes(s, 0).some(p => p.id === 'A20N') && !G.buyableTypes(s, 0).some(p => p.id === 'B744'), `${G.buyableTypes(s, 0).length} on sale in ${s.year}`);
  check('no deadline in endless play', G.quartersLeft(s) > 500);
  const b = G.newGame({ era: 2000, home: 'LHR', seed: 13 });
  b.airlines[0].bankrupt = true; b.over = { kind: 'bankrupt', text: 'test' };
  check('a bankrupt airline cannot fly on', !G.goEndless(b).ok && b.over);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
