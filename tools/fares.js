// Fare and service balance: plays a scenario on several seeds with the computer building the airline,
// then forces one fare/service policy on every route each quarter and compares the final results.
// Run: node tools/fares.js [scenario] [seeds]
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/ops', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
const id = process.argv[2] || 'crisis01', seeds = +(process.argv[3] || 4);
const POLICIES = [
  { name: 'max fare, basic', fare: 50, svc: 0 },
  { name: '+20%, standard', fare: 20, svc: 1 },
  { name: 'standard fare, standard', fare: 0, svc: 1 },
  { name: '+30%, premium', fare: 30, svc: 2 },
  { name: '−25%, basic', fare: -25, svc: 0 },
];
for (const pol of POLICIES) {
  let val = 0, sat = 0, lf = 0, wins = 0;
  for (let k = 1; k <= seeds; k++) {
    const s = G.newGame({ scenario: id, seed: k * 31 }), A = s.airlines[0];
    A.isAI = true; A.pers = 'empire';
    let lfs = [];
    while (!s.over) {
      G.aiTurn(s, 0, { rivals: [], news: [], world: [] });
      for (const r of G.routesOf(s, 0)) { r.fare = pol.fare; r.svc = pol.svc; }
      s.crisis = null;
      G.endQuarter(s);
      const rs = G.routesOf(s, 0).filter(r => r.last);
      if (rs.length) lfs.push(rs.reduce((t, r) => t + r.last.lf, 0) / rs.length);
    }
    val += G.companyValue(s, 0); sat += A.sat ?? 50; lf += lfs.slice(-8).reduce((t, v) => t + v, 0) / Math.max(1, Math.min(8, lfs.length));
    if (s.over.kind === 'win') wins++;
  }
  console.log(`${pol.name.padEnd(24)} value ${(val / seeds).toFixed(0).padStart(5)} · satisfaction ${(sat / seeds).toFixed(0)} · late LF ${Math.round(lf / seeds * 100)}% · wins ${wins}/${seeds}`);
}
