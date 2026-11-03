const path = require('path');
for (const f of ['data/cities','data/aircraft','data/history','data/people','engine/core','engine/market','engine/actions','engine/events','engine/ai','engine/advisor','engine/turn']) require(path.join(__dirname,'..','src',f+'.js'));
const G = globalThis.G; const era=+process.argv[2]||1955;
const s = G.newGame({ home: 'LHR', era, seed: 1 }); s.airlines[0].pers='empire'; s.airlines[0].isAI=true;
for (let t=0;t<12;t++){ const rep={rivals:[],news:[],world:[]}; G.aiTurn(s,0,rep); const r2=G.endQuarter(s);
 const A=s.airlines[0];
 console.log(s.year,s.q,'cash',A.cash.toFixed(1),'fin',A.lastFin&&Object.entries(A.lastFin).map(([k,v])=>k+':'+(+v).toFixed(1)).join(' '));
 console.log('  routes',G.routesOf(s,0).map(r=>`${r.a}-${r.b} ${r.planes}x${r.type} f${r.freq} lf${r.last?r.last.lf.toFixed(2):'-'} p${r.last?r.last.profit.toFixed(1):'-'}`).join('; '));
 console.log('  fleet',A.fleet.map(f=>f.n+'x'+f.type).join(','),'idle',G.idleTotal(s,0),'orders',A.orders.length,'slots',JSON.stringify(A.slots),'news',r2.news.map(n=>n.text).join(' / '));
}
