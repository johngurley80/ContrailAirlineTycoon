const fs=require('fs');const t=JSON.parse(fs.readFileSync(process.argv[2]));
const [sx,sy]=t.transform.scale,[tx,ty]=t.transform.translate;
const arcs=t.arcs.map(a=>{let x=0,y=0;return a.map(([dx,dy])=>{x+=dx;y+=dy;return [x*sx+tx,y*sy+ty]})});
const arc=i=>i<0?arcs[~i].slice().reverse():arcs[i];
const rings=[];
for(const g of t.objects.land.geometries){const polys=g.type==='Polygon'?[g.arcs]:g.arcs;
 for(const p of polys)for(const r of p){let pts=[];r.forEach(i=>{const a=arc(i);pts=pts.concat(pts.length?a.slice(1):a)});
  if(pts.length<4)continue; if(pts.every(q=>q[1]<-60))continue; // drop Antarctica
  for(let k=1;k<pts.length;k++){let d=pts[k][0]-pts[k-1][0];if(d>180)pts[k]=[pts[k][0]-360,pts[k][1]];else if(d<-180)pts[k]=[pts[k][0]+360,pts[k][1]];}
  rings.push(pts.map(q=>[Math.round(q[0]*2)/2,Math.round(q[1]*2)/2]).filter((q,i,a)=>!i||q[0]!==a[i-1][0]||q[1]!==a[i-1][1]))}}
// encode as flat ints (x2) joined
const out=rings.filter(r=>r.length>=4).map(r=>r.map(q=>(q[0]*2)+','+(q[1]*2)).join(',')).join(';');
fs.writeFileSync(process.argv[3],out);console.log(rings.length,out.length);
