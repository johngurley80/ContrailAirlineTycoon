// Headless balance check: rivals' AI also plays the player seat.
const path = require('path');
const files = ['data/cities', 'data/aircraft', 'data/history', 'data/people', 'engine/core', 'engine/market', 'engine/actions', 'engine/events', 'engine/ai', 'engine/advisor', 'engine/finance', 'engine/deals', 'engine/plans', 'engine/turn'];
for (const f of files) require(path.join(__dirname, '..', 'src', f + '.js'));
const G = globalThis.G;
const eras = process.argv[2] ? [+process.argv[2]] : [1955, 1970, 1985, 2000];
for (const era of eras) for (const seed of [1, 2]) {
  const t0 = Date.now();
  const s = G.newGame({ home: era < 1985 ? 'LHR' : 'LHR', era, seed, difficulty: 5 });
  s.airlines[0].pers = 'empire'; s.airlines[0].isAI = true;
  const lines = [];
  while (!s.over) {
    const rep = { rivals: [], news: [], world: [] };
    G.aiTurn(s, 0, rep);
    G.endQuarter(s);
    if (s.q === 0 && (s.year - era) % 5 === 0) lines.push(`${s.year}: ` + s.airlines.map(A => `${A.name.slice(0, 7)}(${A.pers[0]}) $${A.cash.toFixed(0)} h${A.hubs.length} r${G.routesOf(s, s.airlines.indexOf(A)).length} pax${Math.round((A.history.at(-1)?.pax || 0) / 1000)}k${A.bankrupt ? ' X' : ''}`).join(' | '));
  }
  const lfs = s.routes.map(r => r.last && r.last.lf).filter(Boolean);
  const conn = s.routes.reduce((t, r) => t + (r.last ? r.last.conn : 0), 0), tot = s.routes.reduce((t, r) => t + (r.last ? r.last.pax : 0), 0);
  console.log(`era ${era} seed ${seed}: ${s.over.text} (${s.year}) avgLF ${(lfs.reduce((a, b) => a + b, 0) / lfs.length).toFixed(2)} connShare ${(conn / tot).toFixed(2)} biz ${Object.values(s.biz).flat().length} ${Date.now() - t0}ms`);
  console.log(lines.join('\n'));
}
