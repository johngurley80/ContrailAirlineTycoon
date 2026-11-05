// Difficulty check: how often players of different skill win each scenario.
//   passive  - the computer builds the airline for a year, then nothing changes to the end
//   rival    - the computer runs the airline every quarter, exactly as strong as the rival airlines
//   advised  - a player who acts on the game's "Best moves" every quarter (buys, slots, schedule
//              changes, idle aircraft) and lets the computer handle the rest of the airline
// Run: node tools/skill.js [scenario|all] [seeds] [modes] [--diff=4|5|6] [-v]
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/ops', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
if (process.env.EDGE) { const [a, c] = process.env.EDGE.split(',').map(Number); G.RIVAL_EDGE[5] = a; G.RIVAL_COST[5] = c; }
const pos = process.argv.slice(2).filter(a => !a.startsWith('-'));
const which = pos[0] || 'all', seeds = +(pos[1] || 4);
const modes = (pos[2] || 'passive,rival,advised').split(',');
const verbose = process.argv.includes('-v');
const diffArg = process.argv.find(a => a.startsWith('--diff='));
const difficulty = diffArg ? +diffArg.slice(7) : 5;
const ids = which === 'all' ? G.SCENARIOS.map(x => x.id) : which.split(',');

// act on the ranked moves the player sees, best first
function followAdvice(s) {
  const A = s.airlines[0];
  let done = 0;
  for (const x of G.decisions(s)) {
    const b = x.best;
    if (!b || done >= 3) continue;
    if (b.buy && A.cash >= b.planeCash) G.buyPlanes(s, 0, b.spec.type, b.buy);
    for (const z of b.slots || []) if (!G.slotBlock(s, 0, z.c) && G.agentsLeft(s, 0) && A.cash >= b.slotCash) G.negotiateSlots(s, 0, z.c, [5, 10, 20].find(v => v >= z.n) || 20);
    if (b.now && b.spec) {
      const out = x.route != null ? G.updateRoute(s, x.route, { ...s.routes.find(r => r.id === x.route), ...b.spec }) : G.openRoute(s, 0, { fare: 0, svc: 1, cab: 0, peak: false, ...b.spec });
      if (out.ok) done++;
    } else done++;
  }
}

// what a sensible player does for each objective on top of the advice
function objectivePolicy(s) {
  const A = s.airlines[0], obj = s.goal, homeR = G.CITY[A.home].region;
  for (const r of G.routesOf(s, 0)) {
    const lf = r.last ? r.last.lf : 0.8;
    if (obj === 'lowcost') { r.svc = 1; r.fare = G.clamp(Math.min(r.fare, -20) + (lf > 0.95 ? 5 : lf < 0.85 ? -5 : 0), -35, -15); }
    // premium: best service and cabins, and fares high enough that flights are not crowded
    if (obj === 'premium') {
      r.svc = 2; r.cab = G.PLANE[r.type].seats >= 250 ? 2 : 1;
      const d = G.dist(r.a, r.b), room = Math.min(G.slotsAvail(s, 0, r.a, r.id), G.slotsAvail(s, 0, r.b, r.id));
      if (lf > 0.92 && r.freq + 1 <= G.maxFreq(r.type, r.planes, d) && room > r.freq) r.freq++;
      else if (lf > 0.92 && G.idle(s, 0, r.type) > 0 && room > r.freq) { r.planes++; r.freq = Math.min(room, r.freq + 1, G.maxFreq(r.type, r.planes, d)); }
      else r.fare = G.clamp(Math.max(r.fare, 10) + (lf > 0.92 ? 10 : lf < 0.8 ? -5 : 0), 5, 90);
    }
  }
  if (obj === 'regional') {
    // grow the home-region network: one new home-region city a quarter while cash allows
    const served = new Set(G.routesOf(s, 0).flatMap(r => [r.a, r.b]));
    const homeOps = G.opportunities(s, 0, 60).filter(o => G.CITY[o.a].region === homeR && G.CITY[o.b].region === homeR && !served.has(o.b));
    // start slot talks at the next cities that have no slots yet, as many as negotiators allow
    for (const o of homeOps.filter(o => o.slots < 3 && !A.pending.some(p => p.city === o.b)).slice(0, 3))
      if (G.agentsLeft(s, 0) && !G.slotBlock(s, 0, o.b) && A.cash > 40) G.negotiateSlots(s, 0, o.b, 5);
    const o = homeOps.find(o => o.slots >= 3);
    if (o) {
      const type = [...G.fleetTypes(A).filter(t => G.idle(s, 0, t) > 0 && G.PLANE[t].range >= o.d), ...G.buyableTypes(s, 0).filter(P => P.range >= o.d).sort((x, y) => x.price - y.price).map(P => P.id)][0];
      if (type) {
        const sch = G.suggestSchedule(s, 0, { a: o.a, b: o.b, type }, { quick: true, owned: G.idle(s, 0, type), maxPlanes: 3 });
        if (sch) {
          const buy = Math.max(0, sch.planes - G.idle(s, 0, type));
          if (!buy || A.cash > buy * G.planePrice(s, 0, type) + 30) {
            if (buy) G.buyPlanes(s, 0, type, buy);
            else G.openRoute(s, 0, { a: o.a, b: o.b, type, planes: sch.planes, freq: Math.min(sch.freq, o.slots), fare: 0, svc: 1, cab: 0, peak: false });
          }
        }
      }
    }
  }
}

function play(id, seed, mode) {
  const s = G.newGame({ scenario: id, seed, difficulty });
  const A = s.airlines[0];
  // the advised player runs the airline in the style its objective calls for
  A.isAI = true; A.pers = mode === 'advised' && !process.env.EMPIRE ? ({ premium: 'luxe' }[s.goal] || 'empire') : 'empire';
  if (mode === 'advised') A.autoCheck = true;
  let crises = 0, last = '';
  while (!s.over) {
    const rep = { rivals: [], news: [], world: [] };
    if (mode === 'advised') { A.isAI = false; objectivePolicy(s); A.isAI = true; }
    if (mode !== 'passive' || s.turn < 4) G.aiTurn(s, 0, rep);
    if (mode === 'advised') { A.isAI = false; followAdvice(s); objectivePolicy(s); A.isAI = true; }
    if (s.crisis) { crises++; s.crisis = null; }
    G.endQuarter(s);
    if (s.q === 0 && s.goal !== 'value') last = G.objectiveChecks(s, 0, true).filter(c => !c.streak).map(c => `${c.ok ? '+' : '-'}${c.label} ${c.val}`).join('; ');
  }
  const paxOf = j => Object.values(s.airlines[j].lastYr ? s.airlines[j].lastYr.pax : {}).reduce((x, v) => x + v, 0);
  const homeR = G.CITY[A.home].region, here = j => Math.round((s.airlines[j].lastYr ? s.airlines[j].lastYr.pax[homeR] || 0 : 0) / 1000);
  if (verbose && last) console.log(`    ${mode} seed ${seed} last year-end: ${last} · trips ${Math.round((A.lastYr && A.lastYr.trips || 0) / 1000)}k / ${[1, 2, 3].map(j => Math.round((s.airlines[j].lastYr && s.airlines[j].lastYr.trips || 0) / 1000)).join('/')}k · passengers ${Math.round(paxOf(0) / 1000)}k vs most of any rival ${Math.round(Math.max(...[1, 2, 3].map(paxOf)) / 1000)}k · in ${homeR}: ${[0, 1, 2, 3].map(here).join('/')}k · routes ${[0, 1, 2, 3].map(j => G.routesOf(s, j).length).join('/')}`);
  const vals = s.airlines.map((B, j) => (B.bankrupt ? 0 : G.companyValue(s, j)));
  return { win: s.over.kind === 'win', rank: vals.filter(v => v > vals[0]).length + 1, value: vals[0], best: Math.max(...vals.slice(1)), bankrupt: !!A.bankrupt, crises };
}

const t0 = Date.now();
for (const id of ids) {
  const sc = G.SCENARIO[id];
  const line = [];
  for (const mode of modes) {
    let wins = 0, ranks = 0, ratio = 0;
    for (let k = 1; k <= seeds; k++) {
      const r = play(id, k * 97 + 5, mode);
      wins += r.win; ranks += r.rank; ratio += r.best ? r.value / r.best : 1;
    }
    line.push(`${mode} ${wins}/${seeds} wins, avg rank ${(ranks / seeds).toFixed(1)}, value ${Math.round(ratio / seeds * 100)}% of top rival`);
  }
  console.log(`${sc.name.padEnd(18)} (${sc.goal}) · ${line.join(' | ')}`);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (process.argv.includes('--satparts')) {
  const s = G.newGame({ scenario: 'gulf00', seed: 102 }), A = s.airlines[0];
  A.isAI = true; A.pers = 'luxe'; A.autoCheck = true;
  for (let q = 0; q < 16; q++) { A.isAI = false; objectivePolicy(s); A.isAI = true; G.aiTurn(s, 0, { rivals: [], news: [], world: [] }); A.isAI = false; followAdvice(s); objectivePolicy(s); A.isAI = true; s.crisis = null; G.endQuarter(s); }
  console.log('airline sat', A.sat.toFixed(1));
  for (const r of G.routesOf(s, 0)) console.log(r.a + '-' + r.b, r.type, 'pax', r.last && Math.round(r.last.pax), 'lf', r.last && r.last.lf.toFixed(2), 'sat', G.routeSat(s, r).toFixed(0), G.satParts(s, r).filter(p => Math.abs(p[1]) >= 3 && p[0] !== 'Starting point').map(p => p[0].slice(0, 18) + ' ' + p[1].toFixed(0)).join(' | '));
}
