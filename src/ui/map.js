// ---------- world map ----------
const canvas = $('#map'), ctx = canvas.getContext('2d');
const view = { cx: 0, cy: 25, z: 4 };
let W = 0, H = 0, dpr = 1;
const landPath = new Path2D();
LAND_SRC.split(';').forEach(r => {
  const a = r.split(',').map(Number);
  for (let i = 0; i < a.length; i += 2) (i ? landPath.lineTo(a[i] / 2, a[i + 1] / 2) : landPath.moveTo(a[i] / 2, a[i + 1] / 2));
  landPath.closePath();
});
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  const r = $('#stage').getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = r.width; H = r.height;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  clampView(); draw();
}
const minZ = () => W / 360;
function clampView() {
  view.z = Math.max(minZ(), Math.min(60, view.z));
  const half = H / 2 / view.z;
  view.cy = 78 - half < -58 + half ? 10 : Math.max(-58 + half, Math.min(78 - half, view.cy));
  view.cx = ((view.cx + 540) % 360) - 180;
}
const proj = (lon, lat, k) => [W / 2 + (lon + k * 360 - view.cx) * view.z, H / 2 - (lat - view.cy) * view.z];
function copies() {
  const out = [];
  for (let k = -1; k <= 1; k++) {
    const l = W / 2 + (-180 + k * 360 - view.cx) * view.z, r = l + 360 * view.z;
    if (r > -40 && l < W + 40) out.push(k);
  }
  return out;
}
function arc(r, k) {
  const A = CITY[r.a], B = CITY[r.b];
  const dl = ((B.lon - A.lon + 540) % 360) - 180;
  const p0 = proj(A.lon, A.lat, k), p1 = proj(A.lon + dl, B.lat, k);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const c = [(p0[0] + p1[0]) / 2 + nx * len * 0.16, (p0[1] + p1[1]) / 2 + ny * len * 0.16];
  return { p0, p1, c };
}
const bez = (g, t) => [(1 - t) ** 2 * g.p0[0] + 2 * (1 - t) * t * g.c[0] + t * t * g.p1[0], (1 - t) ** 2 * g.p0[1] + 2 * (1 - t) * t * g.c[1] + t * t * g.p1[1]];

function draw(now = performance.now()) {
  if (!W) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0a1120'; ctx.fillRect(0, 0, W, H);
  const ks = copies();
  ctx.strokeStyle = 'rgba(80,110,160,.12)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const k of ks) for (let lon = -180; lon < 180; lon += 30) { const x = proj(lon, 0, k)[0]; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let lat = -60; lat <= 75; lat += 30) { const y = proj(0, lat, 0)[1]; ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // land: rings that cross the date line are unwrapped past ±180, so draw wider copies
  for (let k = -2; k <= 2; k++) {
    const l = W / 2 + (-380 + k * 360 - view.cx) * view.z, r = W / 2 + (380 + k * 360 - view.cx) * view.z;
    if (r < 0 || l > W) continue;
    ctx.save();
    ctx.setTransform(view.z * dpr, 0, 0, -view.z * dpr, (W / 2 + (k * 360 - view.cx) * view.z) * dpr, (H / 2 + view.cy * view.z) * dpr);
    ctx.fillStyle = '#1d2d49'; ctx.fill(landPath);
    ctx.strokeStyle = '#3a5680'; ctx.lineWidth = 1 / view.z; ctx.stroke(landPath);
    ctx.restore();
  }
  if (!S) return;
  const sel = ui.sel, edit = ui.ed;
  const ordered = S.routes.slice().sort((x, y) => (x.o === 0) - (y.o === 0));
  for (const k of ks) for (const r of ordered) {
    const g = arc(r, k), mine = r.o === 0;
    const hot = sel && (r.a === sel || r.b === sel);
    ctx.strokeStyle = S.airlines[r.o].color;
    ctx.globalAlpha = mine ? (sel && !hot ? 0.45 : 0.95) : (hot ? 0.75 : 0.26);
    ctx.lineWidth = mine ? 1.4 + Math.min(2, r.freq / 10) : 1.1;
    ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
    if (mine && !reduceMotion) {
      const n = Math.min(3, Math.max(1, Math.round(r.freq / 7)));
      ctx.fillStyle = '#fff3d6'; ctx.globalAlpha = 0.95;
      for (let j = 0; j < n; j++) {
        const t = ((now / 9000 + j / n + r.id * 0.137) % 1);
        const p = bez(g, t < 0.5 ? t * 2 : 2 - t * 2);
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 7); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  if (edit && edit.a && edit.b) {
    for (const k of ks) {
      const g = arc(edit, k);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = '#f4b13e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (ui.heat) {
    const ops = heatOpps();
    const top = ops.length ? ops[0].value : 1;
    for (const k of ks) ops.forEach((o, n) => {
      const g = arc(o, k);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = '#52d18e'; ctx.globalAlpha = 0.35 + 0.6 * o.value / top; ctx.lineWidth = 1.5 + 2.5 * o.value / top;
      ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
      const [x, y] = proj(CITY[o.b].lon, CITY[o.b].lat, k);
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(82,209,142,.18)'; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, y, 8 + 14 * o.value / top, 0, 7); ctx.fill();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const z = view.z, me = ME();
  const hubOwner = {};
  S.airlines.forEach((A, i) => { if (!A.bankrupt) A.hubs.forEach(h => (hubOwner[h] ||= []).push(i)); });
  ctx.textBaseline = 'middle';
  for (const k of ks) for (const c of CITIES) {
    const [x, y] = proj(c.lon, c.lat, k);
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
    const closed = G.cityClosed(S, 0, c.code) || (G.coldWar(S) && G.blocClash(me.bloc, c.bloc));
    const owners = hubOwner[c.code] || [];
    const st = G.cityStats(S, c.code);
    const rad = 2 + Math.sqrt(st.pop) * 0.55;
    owners.forEach((i, n) => {
      const s = rad + 4 + n * 3;
      ctx.strokeStyle = S.airlines[i].color; ctx.lineWidth = i === 0 ? 2.4 : 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
    });
    ctx.globalAlpha = closed ? 0.35 : 1;
    ctx.fillStyle = (me.slots[c.code] || 0) > 0 ? '#f4d79a' : (c.major ? '#c9d6ea' : '#7f90ad');
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    if (G.bizOwned(S, 0, c.code).length) { ctx.fillStyle = '#f4b13e'; ctx.fillRect(x - 2.5, y + rad + 2, 5, 3); }
    if (c.code === sel) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rad + 9, 0, 7); ctx.stroke(); }
    const showCode = c.major || z > 5.5 || c.code === sel || owners.includes(0);
    if (showCode) {
      ctx.font = `600 ${z > 12 ? 13 : 11}px 'IBM Plex Mono', ui-monospace, monospace`;
      const label = z > 13 ? `${c.code} ${c.name}` : c.code;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,17,32,.85)';
      ctx.strokeText(label, x + rad + 5, y);
      ctx.fillStyle = c.code === sel ? '#ffffff' : (c.major ? '#dfe7f3' : '#9fb0c9');
      ctx.fillText(label, x + rad + 5, y);
    }
    ctx.globalAlpha = 1;
  }
}
function loop(t) { if (ui.tab === 'map' && S && !document.hidden) draw(t); requestAnimationFrame(loop); }

function centerOn(code, z) {
  const c = CITY[code];
  if (z) view.z = z;
  view.cx = c.lon; view.cy = c.lat - (ui.sheet && W < 900 ? (H * 0.25) / view.z : 0);
  clampView(); draw();
}
function zoomAt(f, sx = W / 2, sy = H / 2) {
  const lon = view.cx + (sx - W / 2) / view.z, lat = view.cy - (sy - H / 2) / view.z;
  view.z *= f; clampView();
  view.cx = lon - (sx - W / 2) / view.z; view.cy = lat + (sy - H / 2) / view.z; clampView(); draw();
}
function pickCity(sx, sy) {
  let best = null, bd = 24;
  for (const k of copies()) for (const c of CITIES) {
    const [x, y] = proj(c.lon, c.lat, k), d = Math.hypot(x - sx, y - sy);
    if (d < bd) { bd = d; best = c.code; }
  }
  return best;
}
const ptrs = new Map(); let gesture = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (ptrs.size === 1) gesture = { kind: 'pan', moved: 0 };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), moved: 99 }; }
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p || !gesture) return;
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
  p.x = e.offsetX; p.y = e.offsetY;
  if (gesture.kind === 'pan' && ptrs.size === 1) {
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    view.cx -= dx / view.z; view.cy += dy / view.z; clampView(); draw();
  } else if (gesture.kind === 'pinch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (gesture.d > 0) zoomAt(d / gesture.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    gesture.d = d;
  }
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gesture && gesture.kind === 'pan' && gesture.moved < 8 && ptrs.size === 0) {
    const c = pickCity(e.offsetX, e.offsetY);
    if (c) onCityTap(c); else closeSheet();
  }
  if (ptrs.size === 0) gesture = null;
  else if (ptrs.size === 1) gesture = { kind: 'pan', moved: 99 };
}
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
$('#zin').onclick = () => zoomAt(1.4);
$('#zout').onclick = () => zoomAt(1 / 1.4);
$('#zheat').onclick = () => { if (!S) return; ui.heat = !ui.heat; $('#zheat').setAttribute('aria-pressed', ui.heat); if (ui.heat) toast('Green arcs: the biggest markets you could fly next. See Routes › Opportunities.'); draw(); };
let heatKey = '', heatList = [];
function heatOpps() {
  const k = S.turn + ':' + S.routes.length + ':' + ME().hubs.length;
  if (k !== heatKey) { heatKey = k; heatList = G.opportunities(S, 0, 10); }
  return heatList;
}
$('#zhome').onclick = () => S && centerOn(ME().home, Math.max(minZ(), W / 100));

function renderRegionBar() {
  $('#regionbar').innerHTML = REGIONS.map(R => {
    const i = G.regionLeader(S, R.id);
    const color = i >= 0 ? S.airlines[i].color : 'transparent';
    return `<button data-act="tab" data-tab="world" title="${R.name}: ${i >= 0 ? esc(S.airlines[i].name) + ' leads' : 'no leader yet'}"><span class="dot" style="background:${color};${i < 0 ? 'border:1px solid #8d9cb6' : ''}"></span><b>${R.id}</b></button>`;
  }).join('');
}
