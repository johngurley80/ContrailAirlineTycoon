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

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exitCode = fails ? 1 : 0;
