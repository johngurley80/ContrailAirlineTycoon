// ---------- aircraft art: top-down silhouettes (cards, map) and blueprint side views (detail) ----------
// Every drawing is built in code from a few real dimensions per type, in metres. No image files.
// [length, span, wing sweep°, engines, flags]
// engines: w2/w4 jets on the wing, t2/t3/t4 jets on the rear fuselage, m3 two on the wing + one through the fin,
// s3 two on the wing + one in the tail cone (S-duct), p2/p4 propellers, r2 jets buried in the wing root, d4 delta.
// flags: T T-tail, H high wing, W widebody, U upper-deck hump, D full double deck, L winglets
const SHAPE = {
  DC6: [32.2, 35.8, 3, 'p4', ''], L1049: [35.4, 38.5, 3, 'p4', ''], CV44: [24.8, 32.1, 3, 'p2', ''], VC8: [26.1, 28.6, 3, 'p4', ''],
  F27: [23.6, 29, 2, 'p2', 'H'], B707: [46.6, 44.4, 35, 'w4', ''], DC8: [45.9, 43.4, 30, 'w4', ''], CRVL: [32, 34.3, 20, 't2', ''],
  BA11: [32.6, 28.5, 20, 't2', 'T'], TRID: [35, 29.9, 35, 't3', 'T'], B727: [46.7, 32.9, 32, 't3', 'T'], DC9: [36.4, 28.5, 24, 't2', 'T'],
  B732: [30.5, 28.4, 25, 'w2', ''], F28: [27.4, 25.1, 16, 't2', 'T'], B741: [70.6, 59.6, 37.5, 'w4', 'WU'], DC10: [55.5, 50.4, 35, 'm3', 'W'],
  L1011: [54.2, 47.3, 35, 's3', 'W'], A300: [53.6, 44.8, 28, 'w2', 'W'], CONC: [61.7, 25.6, 0, 'd4', ''], B462: [28.6, 26.2, 15, 'w4', 'HT'],
  SF34: [19.7, 21.4, 2, 'p2', ''], MD80: [45.1, 32.9, 24, 't2', 'T'], B763: [54.9, 47.6, 31, 'w2', 'W'], B752: [47.3, 38, 25, 'w2', ''],
  B733: [33.4, 28.9, 25, 'w2', ''], F100: [35.5, 28.1, 17, 't2', 'T'], AT72: [27.2, 27.1, 2, 'p2', 'HT'], DH83: [25.7, 27.4, 2, 'p2', 'HT'],
  B735: [31, 28.9, 25, 'w2', ''], A320: [37.6, 34.1, 25, 'w2', ''], B744: [70.7, 64.4, 37.5, 'w4', 'WUL'], MD11: [61.6, 51.7, 35, 'm3', 'WL'],
  CRJ2: [26.8, 21.2, 25, 't2', 'TL'], A321: [44.5, 34.1, 25, 'w2', ''], A319: [33.8, 34.1, 25, 'w2', ''], A343: [63.7, 60.3, 30, 'w4', 'WL'],
  A333: [63.7, 60.3, 30, 'w2', 'WL'], B77E: [63.7, 60.9, 31.6, 'w2', 'W'], B738: [39.5, 35.8, 25, 'w2', 'L'], B737: [33.6, 35.8, 25, 'w2', 'L'],
  DH8D: [32.8, 28.4, 2, 'p2', 'HT'], CRJ9: [36.2, 24.9, 26, 't2', 'TL'], E175: [31.7, 26, 23, 'w2', 'L'], E190: [36.2, 28.7, 23, 'w2', 'L'],
  A388: [72.7, 79.8, 33.5, 'w4', 'WDL'], B788: [56.7, 60.1, 32, 'w2', 'W'], A359: [66.8, 64.8, 31.9, 'w2', 'WL'], A20N: [37.6, 35.8, 25, 'w2', 'L'],
  BCS3: [38.7, 35.1, 25, 'w2', ''], B38M: [39.5, 35.9, 25, 'w2', 'L'], A21N: [44.5, 35.8, 25, 'w2', 'L'], SSTX: [52, 20, 0, 'd4', ''],
  IL14: [22.3, 31.7, 3, 'p2', ''], AN24: [23.5, 29.2, 2, 'p2', 'H'], TU104: [38.9, 34.5, 35, 'r2', ''], IL18: [35.9, 37.4, 2, 'p4', ''],
  TU114: [54.1, 51.1, 35, 'p4', ''], TU134: [37.1, 29, 35, 't2', 'T'], IL62: [53.1, 43.2, 32.5, 't4', 'T'], YK40: [20.4, 25, 2, 't3', 'T'],
  TU154: [47.9, 37.6, 35, 't3', 'T'], TU144: [65.5, 28.8, 0, 'd4', ''], IL86: [59.5, 48.1, 35, 'w4', 'W'], YK42: [36.4, 34.9, 23, 't3', 'T'],
  IL96: [55.3, 57.7, 30, 'w4', 'WL'], TU204: [46.1, 42, 28, 'w2', 'L'], SU95: [29.9, 27.8, 24, 'w2', 'L'],
};
const geomCache = {};
// The plan view as polygons, nose at x = 0, tail at x = L, y across the span. Also the numbers the side view reuses.
function planeGeom(id) {
  if (geomCache[id]) return geomCache[id];
  const [L, S, sw, eng, fl] = SHAPE[id] || SHAPE.A320;
  const wide = fl.includes('W'), prop = eng[0] === 'p', delta = eng[0] === 'd', rear = eng[0] === 't';
  const w = id === 'A388' ? 7.1 : wide ? (L > 60 ? 6.2 : 5.6) : delta ? 2.9 : L < 24 ? 2.5 : L < 30 ? 2.9 : L < 34 ? 3.3 : 3.8;
  const half = w / 2, ln = w * 1.7, tl = w * 2.6, tan = Math.tan(sw * Math.PI / 180);
  const fus = [];
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; fus.push([ln * (1 - Math.cos(a)), half * Math.sin(a)]); }
  fus.push([L - tl, half], [L, half * 0.2]);
  const mirror = p => p.concat(p.slice().reverse().map(([x, y]) => [x, -y]));
  const parts = [{ k: 'body', p: mirror(fus) }];
  const x0 = L * (rear ? 0.42 : prop ? 0.34 : wide ? 0.37 : 0.38), cr = S * (prop ? 0.11 : 0.2), ct = cr * (prop ? 0.5 : 0.28);
  const xLE = y => x0 + (y - half) * tan;
  const tip = S / 2, side = p => [{ k: 'wing', p }, { k: 'wing', p: p.map(([x, y]) => [x, -y]) }];
  if (delta) {
    parts.push(...side([[L * 0.22, half], [L * 0.5, S * 0.22], [L * 0.78, S * 0.45], [L * 0.83, tip], [L * 0.93, tip], [L * 0.95, half]]));
    for (const s of [1, -1]) parts.push({ k: 'eng', p: [[L * 0.66, s * S * 0.1], [L * 0.97, s * S * 0.1], [L * 0.97, s * S * 0.27], [L * 0.66, s * S * 0.27]] });
  } else {
    const yk = half + (tip - half) * 0.33, ck = prop ? cr * 0.8 : cr * 0.58;
    parts.push(...side(prop ? [[x0, half], [xLE(tip), tip], [xLE(tip) + ct, tip], [x0 + cr, half]]
      : [[x0, half], [xLE(tip), tip], [xLE(tip) + ct, tip], [xLE(yk) + ck, yk], [x0 + cr, half]]));
    // tailplane
    const tt = fl.includes('T'), St = S * (tt ? 0.32 : 0.36) / 2, xt = L * (tt ? 0.87 : 0.83), crt = St * (tt ? 0.55 : 0.62), tant = Math.tan((sw + 8) * Math.PI / 180);
    parts.push(...side([[xt, half * 0.3], [xt + St * tant, St], [xt + St * tant + crt * 0.42, St], [xt + crt, half * 0.3]]).map(q => ({ ...q, k: 'tail' })));
    // engines
    const pl = prop ? cr * 1.35 : wide ? S * 0.11 + 1 : S * 0.12 + 0.6, pd = prop ? 1.3 : wide ? (S > 58 ? 3.2 : 2.7) : L < 32 ? 1.5 : 2;
    const pod = (y, x, len, d) => [[x, y - d / 2], [x + len, y - d * 0.4], [x + len, y + d * 0.4], [x, y + d / 2]];
    const wingAt = { w2: [0.17], w4: [0.19, 0.35], m3: [0.17], s3: [0.17], p2: [L < 26 ? 0.17 : 0.19], p4: [0.16, 0.31] }[eng];
    if (wingAt) for (const f of wingAt) for (const s of [1, -1]) {
      const y = f * S, x = xLE(y) - pl * (prop ? 0.5 : 0.62);
      parts.push({ k: 'eng', p: pod(s * y, x, pl, pd) });
      if (prop) { const r = { DC6: 2, L1049: 2.1, TU114: 2.8 }[id] || 1.9; parts.push({ k: 'prop', p: [[x - 0.4, s * y - r], [x - 0.1, s * y - r], [x - 0.1, s * y + r], [x - 0.4, s * y + r]] }); }
    }
    if (rear) {
      const rows = eng === 't4' ? [half + pd * 0.55, half + pd * 1.6] : [half + pd * 0.55];
      for (const y of rows) for (const s of [1, -1]) parts.push({ k: 'eng', p: pod(s * y, L * 0.71, pl, pd) });
    }
    if (eng === 'm3' || eng === 's3' || eng === 't3') parts.push({ k: 'eng', p: pod(0, L * 0.76, pl * 0.9, pd * 0.7) });
  }
  return (geomCache[id] = { L, S, sw, eng, fl, w, half, ln, tl, x0, cr, ct, tan, xLE, prop, delta, rear, wide, parts });
}
const pts = (p, X = x => x) => 'M' + p.map(([x, y]) => `${X(x).toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z';
// Top-down silhouette for cards, nose to the right. Bigger aircraft draw bigger, on a softened scale.
function planeTop(id, color = 'var(--livery)', box = [88, 60], fill = 'var(--navy)') {
  const g = planeGeom(id), m = Math.max(g.L, g.S), px = 30 + 52 * Math.min(1, m / 80), sc = px / m;
  const vw = box[0] / sc, vh = box[1] / sc, X = x => g.L - x;
  const body = g.parts.filter(q => q.k !== 'prop').map(q => pts(q.p, X)).join('');
  const props = g.parts.filter(q => q.k === 'prop').map(q => pts(q.p, X)).join('');
  const stripe = `M${X(g.ln * 0.9).toFixed(2)} 0L${X(g.L - g.tl * 0.5).toFixed(2)} 0`;
  return `<svg class="ptop" viewBox="${(g.L / 2 - vw / 2).toFixed(2)} ${(-vh / 2).toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" width="${box[0]}" height="${box[1]}" aria-hidden="true">
    <path d="${body}" fill="${fill}"/>${props ? `<path d="${props}" fill="${fill}" opacity=".55"/>` : ''}
    <path d="${stripe}" stroke="${color}" stroke-width="${(g.w * 0.28).toFixed(2)}" stroke-linecap="round"/></svg>`;
}
// The same silhouette as a canvas path, nose along +x, centred, 1 unit = the larger of length and span.
const pathCache = {};
function planePath(id) {
  if (pathCache[id]) return pathCache[id];
  const g = planeGeom(id), m = Math.max(g.L, g.S), P = new Path2D();
  for (const q of g.parts) { q.p.forEach(([x, y], i) => { const X = (g.L / 2 - x) / m, Y = y / m; i ? P.lineTo(X, Y) : P.moveTo(X, Y); }); P.closePath(); }
  return (pathCache[id] = { path: P, size: m });
}
// Blueprint side view (nose left) plus a plan-view outline, ink on drafting paper. Only the fin carries the livery.
function planeBlueprint(id, color = 'var(--livery)') {
  const g = planeGeom(id), { L, S, w, ln, x0, cr, ct, fl, eng, prop, delta, wide } = g;
  const h = id === 'A388' ? 8.4 : w * 1.06, D = 'M', f = n => n.toFixed(2);
  const sw = Math.max(g.sw, 18) * Math.PI / 180, fh = delta ? 2 + L * 0.14 : 2.4 + L * 0.13, rc = fh * (prop ? 1.25 : 1.05);
  const finLE = L - rc - L * 0.015, finTop = finLE + fh * Math.tan(prop ? 0.5 : sw + 0.12), tc = rc * 0.45, y = v => -v;
  // fuselage: flat belly, round nose, tail cone sweeping up
  const hump = fl.includes('U') ? `C${f(ln * 0.7)} ${f(y(h + 2.4))} ${f(ln * 1.3)} ${f(y(h + 2.4))} ${f(ln * 2.2)} ${f(y(h + 2.4))}L${f(L * (id === 'B744' ? 0.37 : 0.3))} ${f(y(h + 2.4))}C${f(L * 0.36)} ${f(y(h + 2.3))} ${f(L * 0.38)} ${f(y(h))} ${f(L * 0.42)} ${f(y(h))}` : '';
  const body = `${D}0 ${f(y(h * 0.42))}C0 ${f(y(h * 0.8))} ${f(ln * 0.45)} ${f(y(h))} ${f(ln)} ${f(y(h))}${hump}L${f(L * 0.9)} ${f(y(h))}L${f(L)} ${f(y(h * 0.9))}L${f(L)} ${f(y(h * 0.7))}C${f(L * 0.86)} ${f(y(h * 0.42))} ${f(L * 0.78)} ${f(y(0))} ${f(L * 0.66)} 0L${f(ln * 0.9)} 0C${f(ln * 0.3)} 0 0 ${f(y(h * 0.15))} 0 ${f(y(h * 0.42))}Z`;
  const fin = `${D}${f(finLE)} ${f(y(h * 0.98))}L${f(finTop)} ${f(y(h + fh))}L${f(finTop + tc)} ${f(y(h + fh))}L${f(L * 0.995)} ${f(y(h * 0.88))}Z`;
  const tt = fl.includes('T'), st = tt ? `${D}${f(finTop - 1.2)} ${f(y(h + fh - 0.2))}L${f(finTop + tc + 2.2)} ${f(y(h + fh - 0.5))}L${f(finTop + tc + 2.2)} ${f(y(h + fh - 0.1))}Z`
    : delta ? '' : `${D}${f(L * 0.83)} ${f(y(h * 0.62))}L${f(L * 0.99)} ${f(y(h * 0.7))}L${f(L * 0.99)} ${f(y(h * 0.6))}Z`;
  const hw = fl.includes('H'), wy = hw ? h * 0.98 : h * 0.12, tipX = g.xLE(S / 2);
  const wing = delta ? `${D}${f(L * 0.22)} ${f(y(h * 0.2))}C${f(L * 0.5)} ${f(y(h * 0.05))} ${f(L * 0.8)} ${f(y(-0.2))} ${f(L * 0.95)} ${f(y(-0.1))}L${f(L * 0.95)} ${f(y(h * 0.15))}Z`
    : `${D}${f(x0)} ${f(y(wy))}C${f(x0 + cr * 0.3)} ${f(y(wy + 0.5))} ${f(tipX)} ${f(y(wy + 1.2))} ${f(tipX + ct)} ${f(y(wy + 1.1))}L${f(x0 + cr)} ${f(y(wy - 0.2))}Z`;
  const winglet = fl.includes('L') && !delta ? `${D}${f(tipX + ct * 0.1)} ${f(y(wy + 1.1))}L${f(tipX + ct * 0.6)} ${f(y(wy + 3))}L${f(tipX + ct)} ${f(y(wy + 3))}L${f(tipX + ct)} ${f(y(wy + 1.1))}` : '';
  // engines
  const pods = [], extra = [];
  const pl = prop ? cr * 1.35 : wide ? S * 0.11 + 1 : S * 0.12 + 0.6, pd = prop ? 1.3 : wide ? (S > 58 ? 3.2 : 2.7) : L < 32 ? 1.5 : 2;
  const nac = (x, cy, len, d) => `${D}${f(x)} ${f(y(cy + d / 2))}L${f(x + len * 0.85)} ${f(y(cy + d * 0.42))}L${f(x + len)} ${f(y(cy + d * 0.15))}L${f(x + len)} ${f(y(cy - d * 0.15))}L${f(x + len * 0.85)} ${f(y(cy - d * 0.42))}L${f(x)} ${f(y(cy - d / 2))}Z`;
  const wingAt = { w2: [0.17], w4: [0.35, 0.19], m3: [0.17], s3: [0.17], p2: [0.19], p4: [0.31, 0.16] }[eng];
  if (delta) pods.push(nac(L * 0.66, -0.6, L * 0.3, 1.8));
  else if (wingAt) for (const fr of wingAt) {
    const x = g.xLE(fr * S) - pl * (prop ? 0.5 : 0.62), cy = prop ? (hw ? h * 0.9 : wy + 0.2) : wy - pd * 0.55 - 0.3;
    pods.push(nac(x, cy, pl, pd));
    if (!prop) extra.push(`${D}${f(x + pl * 0.45)} ${f(y(cy + pd / 2))}L${f(x + pl * 0.75)} ${f(y(wy))}`);
    else { const r = { DC6: 2, L1049: 2.1, TU114: 2.8 }[id] || 1.9; extra.push(`${D}${f(x - 0.3)} ${f(y(cy - r))}L${f(x - 0.3)} ${f(y(cy + r))}`); }
  }
  if (eng[0] === 't') pods.push(nac(L * 0.71, h * 0.78, pl, pd));
  if (eng === 't4') pods.push(nac(L * 0.72, h * 0.86, pl, pd * 0.9));
  if (eng === 't3' || eng === 's3') extra.push(`${D}${f(finLE - 2)} ${f(y(h))}C${f(finLE - 1.5)} ${f(y(h + 1.4))} ${f(finLE)} ${f(y(h + 1.5))} ${f(finLE + 1.2)} ${f(y(h + 1.2))}`);
  if (eng === 'm3') pods.push(nac(finLE - 1, h + fh * 0.22, pl * 1.05, pd * 0.85));
  // windows, doors, cockpit, gear
  const wl = (yy, a, b) => `<path d="M${f(a)} ${f(y(yy))}L${f(b)} ${f(y(yy))}" stroke-dasharray="0.3 0.62" stroke-width="0.32"/>`;
  const win = (fl.includes('D') ? wl(h * 0.36, ln * 1.1, L * 0.8) + wl(h * 0.74, ln * 1.3, L * 0.78)
    : wl(h * 0.62, ln * 1.25, L * 0.8) + (fl.includes('U') ? wl(h + 1.4, ln * 1.4, L * (id === 'B744' ? 0.35 : 0.28)) : ''));
  const doors = [ln * 1.05, L * 0.5, L * 0.8].map(x => `<rect x="${f(x)}" y="${f(y(h * 0.78))}" width="0.9" height="${f(h * 0.6)}" rx="0.2"/>`).join('');
  const cock = `<path d="M${f(ln * 0.38)} ${f(y(h * 0.7))}L${f(ln * 0.6)} ${f(y(h * 0.8))}L${f(ln * 0.92)} ${f(y(h * 0.8))}L${f(ln * 0.92)} ${f(y(h * 0.68))}Z"/>`;
  const mg = x0 + cr * 0.62, gear = `<path d="M${f(ln * 0.9)} 0L${f(ln * 0.9)} 1.4M${f(mg)} 0L${f(mg)} 1.6"/><circle cx="${f(ln * 0.9)}" cy="1.75" r="0.5"/><circle cx="${f(mg - 0.55)}" cy="2" r="0.6"/><circle cx="${f(mg + 0.55)}" cy="2" r="0.6"/>`;
  const top = -(h + fh + 2), bot = 7, vw = L + 6;
  // plan-view outline below the side view
  const pg = g.parts.map(q => pts(q.p.map(([x, yy]) => [x, yy]))).join('');
  const sideSvg = `<svg class="blueprint" viewBox="-3 ${f(top)} ${f(vw)} ${f(bot - top)}" role="img" aria-label="Side view of the ${esc(PLANE[id] ? PLANE[id].name : id)}">
    <defs><pattern id="bpg-${id}" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="var(--bp-grid)" stroke-width="0.08"/></pattern></defs>
    <rect x="-3" y="${f(top)}" width="${f(vw)}" height="${f(bot - top)}" fill="url(#bpg-${id})"/>
    <g fill="none" stroke="var(--bp-ink)" stroke-width="${f(Math.max(0.09, vw * 0.0034))}" stroke-linejoin="round" stroke-linecap="round">
      <path d="M-2 2.6H${f(L + 2)}" stroke-dasharray="0.6 0.9" opacity=".45"/>
      <path d="${fin}" fill="${color}" stroke="var(--bp-ink)"/>${st ? `<path d="${st}"/>` : ''}
      <path d="${body}" fill="var(--bp-paper)"/>
      <path d="${wing}" fill="var(--bp-paper)"/>${winglet ? `<path d="${winglet}"/>` : ''}
      ${pods.map(p => `<path d="${p}" fill="var(--bp-paper)"/>`).join('')}${extra.map(p => `<path d="${p}"/>`).join('')}
      <g stroke="var(--bp-ink)" opacity=".75">${win}</g>${doors}${cock}${gear}
      <path d="M0 4.6V6.2M${f(L)} 4.6V6.2M0 5.4H${f(L)}" opacity=".7"/>
      <path d="M0.9 4.9L0 5.4L0.9 5.9M${f(L - 0.9)} 4.9L${f(L)} 5.4L${f(L - 0.9)} 5.9" opacity=".7"/>
    </g></svg>`;
  const pv = Math.max(L, S);
  const planSvg = `<svg class="blueprint plan" viewBox="${f(-2)} ${f(-S / 2 - 2)} ${f(L + 4)} ${f(S + 4)}" style="aspect-ratio:${f((L + 4) / (S + 4))}" aria-hidden="true">
    <rect x="-2" y="${f(-S / 2 - 2)}" width="${f(L + 4)}" height="${f(S + 4)}" fill="url(#bpg-${id})"/>
    <path d="${pg}" fill="var(--bp-paper)" stroke="var(--bp-ink)" stroke-width="${f(Math.max(L, S) * 0.004)}" stroke-linejoin="round"/>
    <path d="M${f(L - g.tl * 0.5)} 0L${f(L * 0.92)} 0" stroke="${color}" stroke-width="${f(pv * 0.012)}" stroke-linecap="round"/></svg>`;
  return { side: sideSvg, plan: planSvg, L, S };
}

function setLivery(c) { document.documentElement.style.setProperty('--livery', c || G.COLORS[0]); }
function planeKind(id) {
  const g = planeGeom(id);
  return g.delta ? 'Supersonic' : g.prop ? (['DC6', 'L1049', 'CV44', 'IL14'].includes(id) ? 'Piston propliner' : 'Turboprop') : g.wide ? 'Widebody jet' : g.rear ? 'Rear-engined jet' : 'Narrowbody jet';
}
