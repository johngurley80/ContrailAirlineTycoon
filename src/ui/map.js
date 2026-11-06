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
  ctx.fillStyle = '#cddbd6'; ctx.fillRect(0, 0, W, H);
  const ks = copies();
  ctx.strokeStyle = 'rgba(70,95,90,.16)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const k of ks) for (let lon = -180; lon < 180; lon += 30) { const x = proj(lon, 0, k)[0]; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let lat = -60; lat <= 75; lat += 30) { const y = proj(0, lat, 0)[1]; ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // land: rings that cross the date line are unwrapped past ±180, so draw wider copies
  for (let k = -2; k <= 2; k++) {
    const l = W / 2 + (-380 + k * 360 - view.cx) * view.z, r = W / 2 + (380 + k * 360 - view.cx) * view.z;
    if (r < 0 || l > W) continue;
    ctx.save();
    ctx.setTransform(view.z * dpr, 0, 0, -view.z * dpr, (W / 2 + (k * 360 - view.cx) * view.z) * dpr, (H / 2 + view.cy * view.z) * dpr);
    ctx.fillStyle = '#ece0c2'; ctx.fill(landPath);
    ctx.strokeStyle = '#b39d6e'; ctx.lineWidth = 1.1 / view.z; ctx.stroke(landPath);
    ctx.restore();
  }
  if (!S) return;
  const sel = ui.sel, edit = ui.ed;
  const ordered = S.routes.slice().sort((x, y) => (x.o === 0) - (y.o === 0));
  const owners = {};
  if (ui.mapf === 'comp') for (const r of S.routes) (owners[G.pairKey(r.a, r.b)] ||= new Set()).add(r.o);
  const flyers = [];
  for (const k of ks) for (const r of ordered) {
    const g = arc(r, k), mine = r.o === 0;
    const hot = sel && (r.a === sel || r.b === sel);
    const st = routeStyle(r, mine, hot, owners);
    ctx.strokeStyle = st.color; ctx.globalAlpha = st.alpha; ctx.lineWidth = st.width;
    ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
    if (mine && (!ui.sel || hot)) flyers.push([g, r]);
  }
  ctx.globalAlpha = 1;
  drawFlyers(flyers, now);
  // planned routes: faint dotted arcs
  for (const p of (ME().planned || [])) {
    if (!CITY[p.a] || !CITY[p.b]) continue;
    for (const k of ks) {
      const g = arc(p, k);
      ctx.setLineDash([2, 5]); ctx.strokeStyle = '#2a7fa8'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  if (edit && edit.a && edit.b) {
    for (const k of ks) {
      const g = arc(edit, k);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = '#94650f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (ui.heat) {
    const ops = heatOpps();
    const top = ops.length ? ops[0].value : 1;
    for (const k of ks) ops.forEach((o, n) => {
      const g = arc(o, k);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = '#2f7d4f'; ctx.globalAlpha = 0.35 + 0.6 * o.value / top; ctx.lineWidth = 1.5 + 2.5 * o.value / top;
      ctx.beginPath(); ctx.moveTo(g.p0[0], g.p0[1]); ctx.quadraticCurveTo(g.c[0], g.c[1], g.p1[0], g.p1[1]); ctx.stroke();
      const [x, y] = proj(CITY[o.b].lon, CITY[o.b].lat, k);
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(47,125,79,.14)'; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, y, 8 + 14 * o.value / top, 0, 7); ctx.fill();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const z = view.z, me = ME();
  const hubOwner = {};
  S.airlines.forEach((A, i) => { if (!A.bankrupt) A.hubs.forEach(h => (hubOwner[h] ||= []).push(i)); });
  ctx.textBaseline = 'middle';
  // early on, name the handful of cities where you hold slots so the tutorial's hints can be found
  const fewSlots = Object.keys(me.slots).filter(k => me.slots[k] > 0).length < 10;
  const spare = {};
  if (ui.mapf === 'idle') for (const code of Object.keys(me.slots)) { const f = G.slotsAvail(S, 0, code); if (f > 0) spare[code] = f; }
  for (const k of ks) for (const c of CITIES) {
    const [x, y] = proj(c.lon, c.lat, k);
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
    const closed = G.cityClosed(S, 0, c.code) || (G.coldWar(S) && G.blocClash(me.bloc, c.bloc));
    const owners = hubOwner[c.code] || [];
    const st = G.cityStats(S, c.code);
    const rad = 2 + Math.sqrt(st.pop) * 0.55;
    if (owners.includes(0) && !reduceMotion) {
      const ph = ((now / 2400) + (c.lon + 180) / 97) % 1;
      ctx.strokeStyle = me.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55 * (1 - ph);
      ctx.beginPath(); ctx.arc(x, y, rad + 5 + ph * 16, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    owners.forEach((i, n) => {
      const s = rad + 4 + n * 3;
      ctx.strokeStyle = S.airlines[i].color; ctx.lineWidth = i === 0 ? 2.4 : 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
    });
    ctx.globalAlpha = closed ? 0.35 : 1;
    ctx.fillStyle = (me.slots[c.code] || 0) > 0 ? '#c8902a' : (c.major ? '#3d4a63' : '#8a8470');
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fbf6e9'; ctx.lineWidth = 1; ctx.stroke();
    if (G.bizOwned(S, 0, c.code).length) { ctx.fillStyle = '#94650f'; ctx.fillRect(x - 2.5, y + rad + 2, 5, 3); }
    if (spare[c.code]) { ctx.strokeStyle = '#94650f'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, rad + 3 + Math.min(9, spare[c.code] / 3), 0, 7); ctx.stroke(); ctx.globalAlpha = closed ? 0.35 : 1; }
    if (c.code === sel) { ctx.strokeStyle = '#1d2b45'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rad + 9, 0, 7); ctx.stroke(); }
    const hov = c.code === hoverCity;
    if (hov && c.code !== sel) { ctx.strokeStyle = 'rgba(29,43,69,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rad + 6, 0, 7); ctx.stroke(); }
    // names only where they help: hovered or selected cities, your hubs, the route being planned,
    // spare-capacity rings, or when zoomed right in. Everything else is a tap or hover away.
    const full = hov || c.code === sel;
    const showCode = full || owners.includes(0) || spare[c.code] || (edit && (c.code === edit.a || c.code === edit.b)) || z > 30 || (fewSlots && (me.slots[c.code] || 0) > 0);
    if (showCode) {
      ctx.font = `${full ? 700 : 600} ${full ? 14 : 12}px ${full || z > 40 ? "'Playfair Display', Georgia, serif" : "'IBM Plex Mono', ui-monospace, monospace"}`;
      const label = full || z > 40 ? `${c.code} ${c.name}` : c.code;
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(246,239,220,.95)';
      ctx.strokeText(label, x + rad + 5, y);
      ctx.fillStyle = c.code === sel ? '#0f1a2e' : (c.major ? '#1d2b45' : '#4a4a48');
      ctx.fillText(label, x + rad + 5, y);
    }
    ctx.globalAlpha = 1;
  }
}
// Your aircraft along each route: the type's own top-down silhouette in navy ink (your routes carry the livery), shadowed on the chart.
function drawFlyers(list, now) {
  if (reduceMotion || !list.length) return;
  const px = Math.max(19, Math.min(30, 14 + view.z * 0.9));
  for (const [g, r] of list) {
    const P = planePath(r.type), n = Math.min(3, Math.max(1, Math.round(r.freq / 7)));
    const size = px * (0.7 + 0.3 * Math.min(1, P.size / 70));
    for (let j = 0; j < n; j++) {
      const t = (now / 14000 + j / n + r.id * 0.137) % 1, back = t >= 0.5, u = back ? 2 - t * 2 : t * 2;
      const [x, y] = bez(g, u);
      let dx = 2 * (1 - u) * (g.c[0] - g.p0[0]) + 2 * u * (g.p1[0] - g.c[0]), dy = 2 * (1 - u) * (g.c[1] - g.p0[1]) + 2 * u * (g.p1[1] - g.c[1]);
      if (back) { dx = -dx; dy = -dy; }
      const ang = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(x + 2, y + 3); ctx.rotate(ang); ctx.scale(size, size);
      ctx.fillStyle = 'rgba(60,45,20,.22)'; ctx.fill(P.path); ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(size, size);
      ctx.lineWidth = 2 / size; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(251,246,233,.9)'; ctx.stroke(P.path);
      ctx.fillStyle = '#1d2b45'; ctx.fill(P.path); ctx.restore();
    }
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
let hoverCity = null;
function setHover(c) {
  if (c === hoverCity) return;
  hoverCity = c; canvas.style.cursor = c ? 'pointer' : '';
  draw();
}
canvas.addEventListener('pointerleave', () => setHover(null));
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
  if (e.pointerType === 'mouse' && !ptrs.size) { setHover(S ? pickCity(e.offsetX, e.offsetY) : null); return; }
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
$('#zfind').onclick = () => S && openFinder();
document.querySelectorAll('.mapctl button').forEach(b => (b.title = b.getAttribute('aria-label')));
$('#zmusic').onclick = () => act({ dataset: { act: 'music' } });
function syncMusicBtn() { const b = $('#zmusic'); if (b) { b.setAttribute('aria-pressed', prefs.music !== false); b.title = prefs.music !== false ? 'Music on' : 'Music off'; } }
syncMusicBtn();
// Map filters: colour your routes by profit, show where rivals compete, or show spare seats and slots.
const MAP_FILTERS = [
  ['', ''],
  ['profit', '<b>Profit</b> <i style="background:#2f7d4f"></i> making money <i style="background:#b23a35"></i> losing · thicker = bigger'],
  ['comp', '<b>Competition</b> <i style="background:#b23a35"></i> you face rivals <i style="background:#2f7d4f"></i> yours alone'],
  ['idle', '<b>Spare capacity</b> <i style="background:#d9682b"></i> under 65% full · rings: unused slots'],
];
$('#zfilt').onclick = () => {
  if (!S) return;
  const n = (MAP_FILTERS.findIndex(f => f[0] === (ui.mapf || '')) + 1) % MAP_FILTERS.length;
  ui.mapf = MAP_FILTERS[n][0];
  $('#zfilt').setAttribute('aria-pressed', !!ui.mapf);
  const lg = $('#maplegend');
  lg.hidden = !ui.mapf; lg.innerHTML = MAP_FILTERS[n][1] + (ui.mapf ? ' <button class="chip" id="mapfoff">✕</button>' : '');
  draw();
};
$('#maplegend').addEventListener('click', e => { if (e.target.id === 'mapfoff') { ui.mapf = 'idle'; $('#zfilt').onclick(); } });
function routeStyle(r, mine, hot, owners) {
  const base = { color: S.airlines[r.o].color, alpha: mine ? (ui.sel && !hot ? 0.45 : 0.95) : (hot ? 0.8 : 0.34), width: mine ? 1.4 + Math.min(2, r.freq / 10) : 1.1 };
  const f = ui.mapf;
  if (!f) return base;
  if (f === 'comp') {
    const shared = owners[G.pairKey(r.a, r.b)].size > 1;
    return mine ? { ...base, color: shared ? '#b23a35' : '#2f7d4f', alpha: shared ? 1 : 0.55 } : { ...base, alpha: shared ? 0.85 : 0.05 };
  }
  if (!mine) return { ...base, alpha: 0.05 };
  if (f === 'profit') {
    const p = r.last ? r.last.profit : 0;
    return { ...base, alpha: 1, color: !r.last ? '#8a8470' : p >= 0 ? '#2f7d4f' : '#b23a35', width: 1.4 + Math.min(4, Math.abs(p) / Math.max(0.5, G.eraScale(S)) * 0.8) };
  }
  const lf = r.last ? r.last.lf : 1;
  return { ...base, color: lf < 0.65 ? '#d9682b' : '#8a8470', alpha: lf < 0.65 ? 1 : 0.5 };
}

function renderRegionBar() {
  $('#regionbar').innerHTML = REGIONS.map(R => {
    const i = G.regionLeader(S, R.id);
    const color = i >= 0 ? S.airlines[i].color : 'transparent';
    return `<button data-act="tab" data-tab="world" title="${R.name}: ${i >= 0 ? esc(S.airlines[i].name) + ' leads' : 'no leader yet'}"><span class="dot" style="background:${color};${i < 0 ? 'border:1px solid #8a8470' : ''}"></span><b>${R.id}</b></button>`;
  }).join('');
}
