// Scenario balance check: plays a scenario on several seeds with two simple strategies and reports
// liquidity, load factors and recovery. Run: node tools/scen.js [scenario] [seeds]
//   steady: the computer builds the airline for a year, then keeps the same schedule and fares to the end
//   adapt:  the computer runs the airline every quarter (it trims, reprices and grows)
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/ops', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
const id = process.argv[2] || 'crisis01', seeds = +(process.argv[3] || 6);

function play(seed, mode) {
  const s = G.newGame({ scenario: id, seed });
  const A = s.airlines[0];
  A.isAI = true; A.pers = 'empire';
  const rows = [];
  while (!s.over) {
    const rep = { rivals: [], news: [], world: [] };
    if (mode === 'adapt' || s.turn < 4) G.aiTurn(s, 0, rep);
    if (s.crisis) s.crisis = null; // neither strategy takes the crisis options
    G.endQuarter(s);
    const rs = G.routesOf(s, 0).filter(r => r.last);
    const seats = rs.reduce((t, r) => t + (r.last.lf ? r.last.pax / r.last.lf : 0), 0), pax = rs.reduce((t, r) => t + (r.last.pax || 0), 0);
    const f = A.lastFin || {};
    rows.push({ t: `${s.q === 0 ? s.year - 1 : s.year}Q${s.q === 0 ? 4 : s.q}`, cash: A.cash, profit: f.profit || 0, lf: seats ? pax / seats : 0, routes: rs.length });
  }
  const vals = s.airlines.map((B, j) => (B.bankrupt ? 0 : G.companyValue(s, j)));
  return { rows, over: s.over, rank: vals.filter(v => v > vals[0]).length + 1, value: vals[0], best: Math.max(...vals.slice(1)), bankrupt: !!A.bankrupt };
}

const fmt = v => (v >= 0 ? ' ' : '') + v.toFixed(0);
for (const mode of ['steady', 'adapt']) {
  console.log(`\n== ${id} · ${mode} ==`);
  const agg = [];
  for (let k = 1; k <= seeds; k++) {
    const r = play(k * 101, mode);
    const minCash = Math.min(...r.rows.map(x => x.cash)), lfs = r.rows.map(x => x.lf);
    const losses = r.rows.filter(x => x.profit < 0).length;
    agg.push({ ...r, minCash, losses, lfMin: Math.min(...lfs.slice(2)), lfMax: Math.max(...lfs.slice(2)) });
    console.log(`seed ${k * 101}: ${r.over.kind.padEnd(5)} rank ${r.rank} value ${fmt(r.value)} vs best rival ${fmt(r.best)} · min cash ${fmt(minCash)} · loss quarters ${losses} · LF ${Math.round(Math.min(...lfs.slice(2)) * 100)}–${Math.round(Math.max(...lfs.slice(2)) * 100)}%${r.bankrupt ? ' BANKRUPT' : ''}`);
    if (k === 1) console.log('  ' + r.rows.map(x => `${x.t}:${Math.round(x.lf * 100)}%/${x.profit.toFixed(0)}`).join(' '));
  }
  const wins = agg.filter(x => x.over.kind === 'win').length;
  console.log(`wins ${wins}/${seeds} · avg loss quarters ${(agg.reduce((t, x) => t + x.losses, 0) / seeds).toFixed(1)} · avg min LF ${Math.round(agg.reduce((t, x) => t + x.lfMin, 0) / seeds * 100)}%`);
}
