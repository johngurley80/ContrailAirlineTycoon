const path = require('path');
for (const f of ['data/cities','data/aircraft','data/history','data/people','engine/core','engine/market','engine/actions','engine/events','engine/ai','engine/advisor','engine/turn']) require(path.join(__dirname,'..','src',f+'.js'));
const G = globalThis.G; const era=+process.argv[2]||2000, seed=+process.argv[3]||1;
const s = G.newGame({ home: 'LHR', era, seed }); s.airlines[0].pers='empire'; s.airlines[0].isAI=true;
for (let t=0;t<+(process.argv[4]||24);t++){ G.aiTurn(s,0,{rivals:[],news:[],world:[]}); G.endQuarter(s);
 if (t%4!==3) continue;
 console.log('==',s.year,s.q);
 s.airlines.forEach((A,i)=>{ if(A.bankrupt) return; const f=A.lastFin; console.log(`  ${A.name.slice(0,8)} ${A.pers} cash ${A.cash.toFixed(0)} rev ${f.rev.toFixed(1)} fly ${f.flight.toFixed(1)} own ${f.own.toFixed(1)} slots ${f.slots.toFixed(1)} ovh ${f.overhead.toFixed(1)} biz ${f.biz.toFixed(1)} int ${f.interest.toFixed(1)} => ${f.profit.toFixed(1)} | planes ${A.fleet.reduce((t,x)=>t+x.n,0)} idle ${G.idleTotal(s,i)} slotsHeld ${Object.values(A.slots).reduce((a,b)=>a+b,0)}`);
  console.log('    ', G.routesOf(s,i).map(r=>`${r.a}-${r.b}:${r.type}x${r.planes} f${r.freq} $${r.fare} lf${r.last.lf.toFixed(2)} ${r.last.profit.toFixed(1)}`).join(' ')); });
}
