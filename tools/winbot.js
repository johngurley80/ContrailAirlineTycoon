// A determined player: the "advised" bot from skill.js plus hard, goal-directed expansion every quarter
// (all negotiators on slots, borrowing and leasing to grow, hubs where the goal needs them).
// Answers "can a strong human win this scenario at all?".
// Run: node tools/winbot.js [scenario,...] [seeds] [--diff=4|5|6] [-v]   (HUB2=1: regional player also opens a hub abroad)
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/ops', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
const pos = process.argv.slice(2).filter(a => !a.startsWith('-'));
const ids = (pos[0] || 'dereg78,asia90,gulf00').split(',');
const seeds = +(pos[1] || 4);
const verbose = process.argv.includes('-v');
const diffArg = process.argv.find(a => a.startsWith('--diff='));
const difficulty = diffArg ? +diffArg.slice(7) : 5;

function followAdvice(s) {
  const A = s.airlines[0];
  let done = 0;
  for (const x of G.decisions(s)) {
    const b = x.best;
    if (!b || done >= 4) continue;
    if (b.buy && A.cash >= b.planeCash) G.buyPlanes(s, 0, b.spec.type, b.buy);
    for (const z of b.slots || []) if (!G.slotBlock(s, 0, z.c) && G.agentsLeft(s, 0) && A.cash >= b.slotCash) G.negotiateSlots(s, 0, z.c, [5, 10, 20].find(v => v >= z.n) || 20);
    if (b.now && b.spec) {
      const out = x.route != null ? G.updateRoute(s, x.route, { ...s.routes.find(r => r.id === x.route), ...b.spec }) : G.openRoute(s, 0, { fare: 0, svc: 1, cab: 0, peak: false, ...b.spec });
      if (out.ok) done++;
    } else done++;
  }
}

// the cheapest way to fly a distance: an idle aircraft that reaches it, else the best buyable type by cost per seat
function pickType(s, d, want) {
  const A = s.airlines[0];
  const idle = G.fleetTypes(A).filter(t => G.idle(s, 0, t) > 0 && G.PLANE[t].range >= d && (!want || want(G.PLANE[t])));
  if (idle.length) return { type: idle.sort((x, y) => G.PLANE[x].range - G.PLANE[y].range)[0], idle: true };
  const buy = G.buyableTypes(s, 0).filter(P => P.range >= d && P.range <= Math.max(d * 2.5, 3000) && (!want || want(P)));
  const all = buy.length ? buy : G.buyableTypes(s, 0).filter(P => P.range >= d && (!want || want(P)));
  if (!all.length) return null;
  const cost = P => (P.hourly * (d / P.speed + 0.8) + P.price * 0.6) / P.seats;
  return { type: all.sort((x, y) => cost(x) - cost(y))[0].id, idle: false };
}

function expand(s, P) {
  const A = s.airlines[0], homeR = G.CITY[A.home].region;
  const reserve = 25;
  // keep borrowing room in use while profitable: growth is what wins
  if (A.cash < 80 && (G.annualProfit(s, 0) > 0 || s.turn < 4)) { const lim = G.borrowLimit(s, 0); if (lim > 20) G.borrow(s, 0, Math.min(lim, 150)); }
  // hubs in new regions when the goal wants them
  if (P.hubs) for (const r of G.routesOf(s, 0)) for (const c of [r.a, r.b]) if (!G.hubBlock(s, 0, c) && G.agentsLeft(s, 0) && A.cash > G.hubPrice(s, c) + reserve) G.buildHub(s, 0, c);
  // grow existing routes that turn people away
  for (const r of G.routesOf(s, 0)) {
    if (!r.last) continue;
    const d = G.dist(r.a, r.b), room = Math.min(G.slotsAvail(s, 0, r.a, r.id), G.slotsAvail(s, 0, r.b, r.id));
    if (r.last.lf > P.full && room > r.freq) {
      if (r.freq + 1 <= G.maxFreq(r.type, r.planes, d)) r.freq++;
      else if (G.idle(s, 0, r.type) > 0) { r.planes++; r.freq = Math.min(room, r.freq + 2, G.maxFreq(r.type, r.planes, d)); }
      else if (A.cash > G.planePrice(s, 0, r.type) + reserve && G.canBuy(s, 0, r.type)) G.buyPlanes(s, 0, r.type, 1);
    }
  }
  // a second hub elsewhere opens a fresh airport's worth of slots, when the goal allows it
  if (P.hub2 && A.hubs.length < 2) for (const r of G.routesOf(s, 0)) for (const c of [r.a, r.b]) if (G.CITY[c].region !== homeR && !G.hubBlock(s, 0, c) && G.agentsLeft(s, 0) && A.cash > G.hubPrice(s, c) + reserve && A.hubs.length < 2) G.buildHub(s, 0, c);
  // buy rivals' spare slots at a crowded hub
  for (const h of A.hubs) if (G.slotsAvail(s, 0, h) < 6) for (const o of G.slotOffers(s, 0, h).sort((x, y) => x.unit - y.unit)) {
    const n = Math.min(o.n, 10);
    if (A.cash > o.unit * n + reserve) G.buySlotsFrom(s, 0, o.j, h, n);
  }
  const opps = G.opportunities(s, 0, 120).filter(P.filter);
  // short of routes and the hub is full: thin the busiest routes to make room for new cities
  const need = P.routes(s) - G.routesOf(s, 0).length;
  if (need > 0) for (const h of A.hubs) {
    let room = G.slotsAvail(s, 0, h), guard = 0;
    while (room < 3 * Math.min(need, 2) && guard++ < 20) {
      const big = G.routesOf(s, 0).filter(r => (r.a === h || r.b === h) && r.freq > 5).sort((x, y) => y.freq - x.freq)[0];
      if (!big) break;
      big.freq--; room++;
      const d = G.dist(big.a, big.b);
      while (big.planes > 1 && G.maxFreq(big.type, big.planes - 1, d) >= big.freq) big.planes--;
    }
  }
  // slot talks for the best markets: the hub first, then destinations with no room
  for (const h of A.hubs) if (G.slotsAvail(s, 0, h) < 20 && !G.slotBlock(s, 0, h) && G.agentsLeft(s, 0) && A.cash > G.slotPrice(s, h) * 20 + reserve) G.negotiateSlots(s, 0, h, 20);
  for (const o of opps.slice(0, 12)) {
    if (!G.agentsLeft(s, 0)) break;
    if (G.slotsAvail(s, 0, o.b) < 7 && !G.slotBlock(s, 0, o.b) && A.cash > G.slotPrice(s, o.b) * 10 + reserve) G.negotiateSlots(s, 0, o.b, 10);
  }
  // open routes wherever slots allow
  let opened = 0;
  const served = new Set(G.routesOf(s, 0).map(r => G.pairKey(r.a, r.b)));
  for (const o of opps) {
    if (opened >= P.perQ || (P.cap && G.routesOf(s, 0).length >= P.routes(s) + 1)) break;
    if (served.has(G.pairKey(o.a, o.b)) || Math.min(G.slotsAvail(s, 0, o.a), G.slotsAvail(s, 0, o.b)) < 3) continue;
    const pick = pickType(s, o.d, P.want);
    if (!pick) continue;
    const owned = G.idle(s, 0, pick.type);
    const sch = G.suggestSchedule(s, 0, { a: o.a, b: o.b, type: pick.type }, { quick: true, owned, maxPlanes: Math.max(owned, 4) });
    if (!sch || sch.planes < 1) continue;
    if (owned >= sch.planes) {
      const out = G.openRoute(s, 0, { a: o.a, b: o.b, type: pick.type, planes: sch.planes, freq: Math.min(sch.freq, G.slotsAvail(s, 0, o.a), G.slotsAvail(s, 0, o.b), need > 1 ? 7 : 28), fare: P.fare, svc: P.svc, cab: P.cab(pick.type), peak: false });
      if (out.ok) { opened++; served.add(G.pairKey(o.a, o.b)); }
    } else {
      const n = sch.planes - owned, price = G.planePrice(s, 0, pick.type) * n;
      if (A.cash > price + reserve) G.buyPlanes(s, 0, pick.type, n);
      else if (G.leaseRoom(s, 0) > G.leaseCost(s, 0, pick.type) * n) G.leasePlanes(s, 0, pick.type, n);
      else continue;
      opened++;
    }
  }
}

const POLICY = {
  regional: homeR => ({ hub2: process.env.HUB2 === '1', routes: s => Math.max(G.routeTarget(s), G.goalTarget(s, 'regionCities')) + 1, filter: o => G.CITY[o.b].region === homeR || (process.env.HUB2 === '1' && G.CITY[o.a].region !== homeR), perQ: 3, full: 0.85, fare: -5, svc: 1, cab: () => 0, hubs: false }),
  lowcost: () => ({ hub2: true, routes: s => G.routeTarget(s) + 1, filter: o => o.d < 5000, perQ: 3, full: 0.88, fare: -18, svc: 1, cab: () => 0, hubs: false, want: P => P.seats >= 120 }),
  premium: () => ({ cap: true, routes: s => G.routeTarget(s) + 1, filter: () => true, perQ: 2, full: 0.86, fare: 15, svc: 2, cab: t => (G.PLANE[t].seats >= 250 ? 2 : 1), hubs: true }),
};

function tune(s, P, goal) {
  // keep fares in line with the goal: low-cost under −10%, premium high enough to keep cabins uncrowded
  for (const r of G.routesOf(s, 0)) {
    const lf = r.last ? r.last.lf : 0.8;
    if (goal === 'lowcost') { r.svc = 1; r.fare = G.clamp(r.fare + (lf > 0.95 ? 3 : lf < 0.8 ? -3 : 0), -30, -14); }
    if (goal === 'premium') { r.svc = 2; r.cab = P.cab(r.type); r.fare = G.clamp(r.fare + (lf > 0.9 ? 4 : lf < 0.75 ? -5 : 0), 0, G.fareAllowance(r)); if (!r.peak && G.peakFree(s, r.a) > r.freq && G.peakFree(s, r.b) > r.freq) r.peak = true; }
    if (goal === 'regional' && r.last && r.last.profit < -2 && r.age > 3) r.fare = G.clamp(r.fare + 5, -20, 30);
  }
}

function play(id, seed) {
  const s = G.newGame({ scenario: id, seed, difficulty });
  const A = s.airlines[0], P = POLICY[s.goal](G.CITY[A.home].region);
  A.isAI = true; A.pers = s.goal === 'premium' ? 'luxe' : 'empire'; A.autoCheck = true;
  const log = [];
  while (!s.over) {
    A.isAI = false; expand(s, P); tune(s, P, s.goal); A.isAI = true;
    G.aiTurn(s, 0, { rivals: [], news: [], world: [] });
    A.isAI = false; followAdvice(s); expand(s, P); tune(s, P, s.goal); A.isAI = true;
    s.crisis = null;
    if (process.env.TRACE) console.log(s.year, s.q, "hub slots free", G.slotsAvail(s, 0, A.home), "cash", Math.round(A.cash), "routes", G.routesOf(s, 0).length);
    G.endQuarter(s);
    if (s.q === 0) log.push(`${s.year - 1}: ` + G.objectiveChecks(s, 0, true).map(c => `${c.ok ? '+' : '-'}${c.label.replace(/ \(.*\)/, '').slice(0, 22)} ${c.val}`).join('; '));
  }
  if (verbose) console.log(`  seed ${seed}:\n    ` + log.join('\n    ') + `\n    => ${s.over.kind}: ${s.over.text || ''}`);
  return s.over.kind === 'win';
}

for (const id of ids) {
  let w = 0;
  for (let k = 1; k <= seeds; k++) w += play(id, k * 97 + 5);
  console.log(`${G.SCENARIO[id].name.padEnd(18)} strong player: ${w}/${seeds} wins`);
}
