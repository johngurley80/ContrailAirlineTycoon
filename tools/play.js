// A scripted playthrough: plays the player seat with the same actions the UI offers and logs what happens.
//   node tools/play.js [era] [home] [seed]
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
const era = +process.argv[2] || 1970, home = process.argv[3] || 'JFK', seed = +process.argv[4] || 11;
const s = G.newGame({ name: 'Contrail Air', home, era, seed, difficulty: 5 });
const A = s.airlines[0];
const m = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(0) + 'M';
const log = (...x) => console.log(...x);
let acts = [], idleQ = 0;
const did = t => acts.push(t);

function sizeRoute(a, b) {
  const d = G.dist(a, b);
  const types = G.fleetTypes(A).filter(t => G.PLANE[t].range >= d && G.idle(s, 0, t) > 0).sort((x, y) => G.PLANE[y].seats - G.PLANE[x].seats);
  if (!types.length) return null;
  const t = types[0], P = G.PLANE[t];
  const want = Math.max(2, Math.round(G.baseDemand(s, a, b) * 0.5 / P.seats));
  const planes = Math.min(G.idle(s, 0, t), Math.max(1, Math.ceil(want * G.rtHours(t, d) / G.HOURS_PER_PLANE)));
  const freq = Math.min(want, G.maxFreq(t, planes, d), G.slotsAvail(s, 0, a), G.slotsAvail(s, 0, b));
  return freq >= 2 ? { a, b, type: t, planes, freq, fare: 0, svc: 1 } : null;
}

function quarter() {
  acts = [];
  // 1. city requests: take cheap goodwill, keep promises we can keep
  if (s.crisis) {
    const o = s.crisis.options[s.turn % s.crisis.options.length];
    did(`crisis "${s.crisis.title}": chose ${o.label}`); G.resolveCrisis(s, o.key);
  }
  for (const q of s.requests.slice()) {
    const yes = q.kind === 'route' || q.kind === 'contract' ? !!sizeRoute(q.city, q.other) || A.hubs.includes(q.city) : q.cost <= A.cash * 0.05;
    G.answerRequest(s, q.id, yes); did(`${yes ? 'accepted' : 'declined'} ${q.kind} request from ${q.city}`);
  }
  // keep contracts: open the route or add flights to reach the target
  for (const c of s.contracts) {
    const st = G.contractStatus(s, c);
    if (st.ok) continue;
    if (st.r) {
      const need = { ...st.r, freq: c.minFreq };
      need.planes = Math.max(st.r.planes, Math.ceil(c.minFreq * G.rtHours(st.r.type, G.dist(st.r.a, st.r.b)) / G.HOURS_PER_PLANE));
      if (G.updateRoute(s, st.r.id, need).ok) did(`contract ${c.city}-${c.other}: raised to ${c.minFreq}/wk`);
    } else {
      const spec = sizeRoute(c.city, c.other);
      if (spec) { spec.freq = Math.max(spec.freq, c.minFreq); spec.planes = Math.max(spec.planes, Math.ceil(spec.freq * G.rtHours(spec.type, G.dist(c.city, c.other)) / G.HOURS_PER_PLANE)); if (G.openRoute(s, 0, spec).ok) did(`contract ${c.city}-${c.other}: opened at ${spec.freq}/wk`); }
    }
  }
  // 2. tune every route with the advisor (only on routes with a result)
  for (const r of G.routesOf(s, 0).filter(r => r.last && r.age >= 1)) {
    const adv = G.routeAdvice(s, r.id);
    if (adv && adv.gain > 0.5) { G.updateRoute(s, r.id, adv.best); did(`advisor on ${r.a}-${r.b}: ${adv.changes.join(', ')} (+${adv.gain.toFixed(1)})`); }
    else if (r.last.profit < -1 && r.age >= 4) { G.closeRoute(s, r.id); did(`closed loser ${r.a}-${r.b}`); }
  }
  // 3. open the best opportunities we can
  for (const o of G.opportunities(s, 0, 20)) {
    if (!G.idleTotal(s, 0)) break;
    const spec = sizeRoute(o.a, o.b);
    if (spec && G.openRoute(s, 0, spec).ok) did(`opened ${o.a}-${o.b} (${spec.planes}x${spec.type} ${spec.freq}/wk, opp ~${m(o.value)})`);
  }
  // 4. hubs first, then slots where the opportunities are
  for (const R of G.REGIONS) {
    if (A.hubs.some(h => G.CITY[h].region === R.id)) continue;
    const c = G.CITIES.filter(c => c.region === R.id && !G.hubBlock(s, 0, c.code)).sort((x, y) => y.econ - x.econ)[0];
    if (c && A.cash > G.hubPrice(s, c.code) + 30 && G.buildHub(s, 0, c.code).ok) { did(`building hub in ${c.name} (${m(G.hubPrice(s, c.code))})`); break; }
  }
  const want = new Set();
  for (const o of G.opportunities(s, 0, 12)) { if (G.slotsAvail(s, 0, o.a) < 4) want.add(o.a); if (G.slotsAvail(s, 0, o.b) < 4) want.add(o.b); }
  for (const R of G.REGIONS) if (!A.hubs.some(h => G.CITY[h].region === R.id)) {
    const c = G.CITIES.filter(c => c.region === R.id && c.major && !G.cityClosed(s, 0, c.code) && !(G.coldWar(s) && G.blocClash(A.bloc, c.bloc))).sort((x, y) => y.econ - x.econ)[0];
    if (c) want.add(c.code);
  }
  for (const c of [...want].slice(0, 3)) if (G.agentsLeft(s, 0) && !G.slotBlock(s, 0, c) && G.airportFree(s, c) >= 5) { const n = A.hubs.includes(c) ? 20 : 10; if (G.negotiateSlots(s, 0, c, n).ok) did(`negotiator to ${c} for ${n} slots`); }
  // 5. aircraft: buy for the top unflown opportunity, lease when cash is tight, borrow when the rating is good
  const top = G.opportunities(s, 0, 6).find(o => o.slots >= 3);
  idleQ = G.idleTotal(s, 0) ? idleQ + 1 : 0;
  if (idleQ >= 3) for (const ty of G.fleetTypes(A)) { const n = Math.min(G.idle(s, 0, ty), G.ownedCount(A, ty)); if (n && G.sellPlanes(s, 0, ty, n).ok) did(`sold ${n} idle ${ty}`); }
  if (top && G.idleTotal(s, 0) <= 1 && !A.orders.length) {
    const d = top.d, pool = G.buyableTypes(s, 0).filter(p => p.range >= d).sort((x, y) => x.hourly / x.seats - y.hourly / y.seats);
    const P = pool.find(p => p.seats <= top.unmet * 0.6) || pool[0];
    if (P) {
      const price = G.planePrice(s, 0, P.id), n = Math.max(1, Math.min(4, Math.floor(A.cash / price / 2)));
      if (A.cash < price * 1.5 && G.borrowLimit(s, 0) > price && G.ratingIdx(s, 0) <= 3) { G.borrow(s, 0, Math.round(price * 1.2)); did(`borrowed ${m(price * 1.2)} at ${G.rating(s, 0)}`); }
      if (A.cash > price * n + 20) { G.buyPlanes(s, 0, P.id, n); did(`bought ${n}x ${P.name}`); }
      else if (G.leasePlanes(s, 0, P.id, 2).ok) did(`leased 2x ${P.name}`);
    }
  }
  if (A.debt > 0 && A.cash > A.debt + 150) { G.repay(s, 0, A.debt); did('repaid all loans'); }
  // 6. deals: codeshare with the friendliest rival, buy routes from rivals in trouble, take over if offered
  if (!s.alliances.length && G.agentsLeft(s, 0) && s.turn > 8) {
    const j = [1, 2, 3].filter(j => !s.airlines[j].bankrupt).sort((x, y) => G.codeshareOdds(s, y) - G.codeshareOdds(s, x))[0];
    if (j) { const r = G.proposeCodeshare(s, j); if (r.ok) did(`codeshare with ${s.airlines[j].name}: ${r.yes ? 'YES' : 'no'}`); }
  }
  for (let j = 1; j < 4; j++) {
    const T = G.takeoverTerms(s, j);
    if (!T.block && A.cash > T.price + 100) { const r = G.takeover(s, j); if (r.ok) did(`TOOK OVER ${s.airlines[j].name} for ${m(T.price)}`); }
  }
  // 7. hedge when oil is cheap; advertise in the home region when rich
  if (!A.hedge && G.fuelMult(s) < 0.9 && A.cash > 100) { G.hedgeFuel(s, 0); did(`hedged fuel at ${Math.round(G.fuelMult(s) * 100)}%`); }
  if (A.cash > 300 && G.agentsLeft(s, 0)) { G.adCampaign(s, 0, G.CITY[A.home].region, 1); did('ad campaign at home'); }
  for (const code of A.hubs) if (A.cash > 250 && !G.bizBlock(s, 0, code, 'agency')) { G.buyBusiness(s, 0, code, 'agency'); did(`bought travel agency in ${code}`); }
}

log(`=== Contrail Air · ${home} · era ${era} · seed ${seed} ===`);
log('Rivals:', s.airlines.slice(1).map(B => `${B.name} (${B.ceo}, ${B.pers}, ${B.home})`).join('; '));
while (!s.over) {
  const y = s.year, q = s.q;
  quarter();
  const rep = G.endQuarter(s);
  const f = rep.fin;
  log(`\nQ${q + 1} ${y}: profit ${m(f.profit)} cash ${m(A.cash)} pax ${Math.round(f.pax / 1000)}k routes ${G.routesOf(s, 0).length} hubs ${A.hubs.join(',')} sat ${Math.round(A.sat)} rating ${G.rating(s, 0)} debt ${m(A.debt)}`);
  if (acts.length) log('  you: ' + acts.join('; '));
  for (const n of rep.news) log('  news: ' + n.text);
  for (const r of rep.rivals.filter(r => r.kind !== 'slots')) log('  rival: ' + r.text);
  for (const w of rep.world) log('  world: ' + w.text);
  for (const x of rep.milestones || []) log('  ★ milestone: ' + x.name);
  if (rep.yearEnd) {
    const g = rep.yearEnd.goals[0];
    log(`  >> YEAR END ${rep.yearEnd.year}: hubs ${g ? g.hubRegions.length : 0}/7, lead ${g ? g.leads.join(',') : '-'}, profit ${g ? m(g.profit) : '-'} | values: ` + s.airlines.map((B, i) => `${B.name.split(' ')[0]} ${B.bankrupt ? (B.taken ? 'taken' : 'bust') : m(G.companyValue(s, i))}`).join(', '));
  }
}
log(`\n=== GAME OVER (${s.year}): ${s.over.text} ===`);
log('Milestones:', Object.keys(s.ms).join(', '));
