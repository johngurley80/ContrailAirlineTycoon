const path = require('path');
for (const f of ['data/cities','data/aircraft','data/history','data/people','engine/core','engine/market','engine/actions','engine/events','engine/ai','engine/advisor','engine/turn']) require(path.join(__dirname,'..','src',f+'.js'));
const G = globalThis.G;
for (const era of [1955,1970,1985,2000]) {
  const s = G.newGame({ home: 'LHR', era, seed: 1 });
  const A = s.airlines[0];
  console.log(era, 'fleet', A.fleet.map(f=>f.n+'x'+f.type).join(','), 'starters', A.starters.join(','), 'cash', A.cash);
  for (const dest of A.starters) for (const f of A.fleet) {
    const d = G.dist('LHR', dest); const P = G.PLANE[f.type]; if (P.range < d) continue;
    const planes = Math.min(f.n, 2), freq = Math.min(G.maxFreq(f.type, planes, d), 8);
    const pv = G.previewRoute(s, 0, { a: 'LHR', b: dest, type: f.type, planes, freq, fare: 0 });
    console.log(`  LHR-${dest} ${d}km ${planes}x${f.type} f${freq}: dem ${pv.demand} pax/wk ${pv.paxWeek} lf ${pv.lf.toFixed(2)} rev ${pv.rev.toFixed(1)} cost ${pv.cost.toFixed(1)} own ${pv.own.toFixed(1)} net ${pv.net.toFixed(1)}`);
  }
}
