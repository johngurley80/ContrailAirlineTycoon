// ---------- small SVG charts: lines, bars, radar ----------
const AXIS = '#24344f', LABEL = '#8d9cb6';
function chartFmt(v) { return Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(1); }

// series: [{ name, color, values: [number|null] }], labels: x labels (same length as values)
function lineChart(series, labels, o = {}) {
  const w = 320, h = o.h || 150, pl = 34, pr = 10, pt = 10, pb = 20;
  const all = series.flatMap(s => s.values).filter(v => v != null);
  if (all.length < 2) return '<p class="muted small">Not enough history yet. Charts fill in as quarters pass.</p>';
  let lo = Math.min(o.zero === false ? Infinity : 0, ...all), hi = Math.max(...all);
  if (hi === lo) hi = lo + 1;
  const n = labels.length, fmt = o.fmt || chartFmt;
  const x = k => pl + (n === 1 ? 0 : k / (n - 1)) * (w - pl - pr), y = v => pt + (1 - (v - lo) / (hi - lo)) * (h - pt - pb);
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${pl}" x2="${w - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${AXIS}" ${v === lo ? '' : 'stroke-dasharray="2 3"'}/><text x="${pl - 4}" y="${y(v) + 3}" text-anchor="end">${fmt(v)}</text>`).join('');
  const zero = lo < 0 && hi > 0 ? `<line x1="${pl}" x2="${w - pr}" y1="${y(0)}" y2="${y(0)}" stroke="#3a5680"/>` : '';
  const step = Math.max(1, Math.ceil(n / 5));
  const xl = labels.map((l, k) => (k % step === 0 || k === n - 1 ? `<text x="${x(k)}" y="${h - 5}" text-anchor="middle">${l}</text>` : '')).join('');
  const lines = series.map(s => {
    const pts = s.values.map((v, k) => (v == null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
    const last = s.values.map((v, k) => [v, k]).filter(p => p[0] != null).pop();
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.bold ? 2.6 : 1.8}" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="4 3"' : ''}/>` +
      (last ? `<circle cx="${x(last[1])}" cy="${y(last[0])}" r="3" fill="${s.color}"/>` : '');
  }).join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || 'Chart')}">${grid}${zero}${xl}${lines}</svg>${legend}`;
}

// Vertical bars with negative values below the axis.
function barChart(values, labels, o = {}) {
  const w = 320, h = o.h || 130, pl = 34, pr = 6, pt = 10, pb = 20;
  if (!values.length) return '<p class="muted small">No results yet.</p>';
  const lo = Math.min(0, ...values), hi = Math.max(0.0001, ...values);
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (h - pt - pb), bw = (w - pl - pr) / values.length;
  const fmt = o.fmt || chartFmt;
  const bars = values.map((v, k) => {
    const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
    return `<rect x="${pl + k * bw + bw * 0.18}" y="${y0}" width="${bw * 0.64}" height="${Math.max(1, y1 - y0)}" rx="2" fill="${v >= 0 ? (o.color || '#52d18e') : '#ef6f6c'}"/>` +
      `<text x="${pl + k * bw + bw / 2}" y="${h - 5}" text-anchor="middle">${labels[k]}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || 'Bar chart')}">
    <line x1="${pl}" x2="${w - pr}" y1="${y(0)}" y2="${y(0)}" stroke="#3a5680"/>
    <text x="${pl - 4}" y="${y(hi) + 3}" text-anchor="end">${fmt(hi)}</text>${lo < 0 ? `<text x="${pl - 4}" y="${y(lo) + 3}" text-anchor="end">${fmt(lo)}</text>` : ''}${bars}</svg>`;
}

// axes: [name], series: [{ name, color, values: 0..1 per axis }]
function radarChart(axes, series) {
  const w = 300, h = 250, cx = 150, cy = 125, R = 88, n = axes.length;
  const pt = (k, v) => [cx + Math.sin(k / n * 2 * Math.PI) * R * v, cy - Math.cos(k / n * 2 * Math.PI) * R * v];
  const rings = [0.25, 0.5, 0.75, 1].map(v => `<polygon points="${axes.map((_, k) => pt(k, v).join(',')).join(' ')}" fill="none" stroke="${AXIS}"/>`).join('');
  const spokes = axes.map((a, k) => {
    const [x, y] = pt(k, 1), [lx, ly] = pt(k, 1.2);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${AXIS}"/><text x="${lx}" y="${ly + 3}" text-anchor="${lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle'}">${a}</text>`;
  }).join('');
  const polys = series.map(s => `<polygon points="${s.values.map((v, k) => pt(k, Math.max(0.03, v)).join(',')).join(' ')}" fill="${s.color}" fill-opacity="${s.bold ? 0.22 : 0.06}" stroke="${s.color}" stroke-width="${s.bold ? 2.4 : 1.4}" stroke-linejoin="round"/>`).join('');
  return `<svg class="chart radar" viewBox="0 0 ${w} ${h}" role="img" aria-label="Scorecard compared with rivals">${rings}${spokes}${polys}</svg>
    <div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

const qShort = h => `Q${h.q + 1} '${String(h.y).slice(2)}`;
