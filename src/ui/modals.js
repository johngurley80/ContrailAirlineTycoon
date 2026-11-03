// ---------- modals: start screen, quarter report, year-end ceremony, board meeting, game over ----------
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card">${html}</div>`;
  m.hidden = false; m.scrollTop = 0;
}
function closeModal() { $('#modal').hidden = true; }

// Queue of screens shown after a quarter ends: report → ceremony → meeting → game over.
function nextInQueue() {
  const k = ui.queue.shift();
  if (!k) { closeModal(); renderAll(); return; }
  if (k === 'report') showReport(ui.lastRep);
  else if (k === 'score') showScorecard(ui.lastRep);
  else if (k === 'ceremony') showCeremony(ui.lastRep);
  else if (k === 'meeting') showMeeting();
  else if (k === 'over') showGameOver();
}

function flapRow(label, value, color) {
  return `<span>${label}</span><span class="w"${color ? ` style="color:${color}"` : ''}>${value}</span>`;
}
function showReport(rep) {
  $('#toast').hidden = true;
  const f = rep.fin, A = ME();
  const top = rep.results.slice().sort((x, y) => y.profit - x.profit);
  const conn = top.reduce((t, r) => t + (r.conn || 0), 0);
  openModal(`
    <div class="board flip">
      <span class="h">${qLabel(rep.year, rep.q)} · results</span>
      ${flapRow('Passengers', nf(f.pax))}
      ${conn ? flapRow('  connecting', nf(conn)) : ''}
      ${flapRow('Revenue', money(f.rev + Math.max(0, f.biz)))}
      ${flapRow('Costs', '−' + money(f.cost + Math.max(0, -f.biz)))}
      ${flapRow('Profit', signed(f.profit), f.profit >= 0 ? '#52d18e' : '#ef6f6c')}
      ${flapRow('Cash', money(A.cash))}
    </div>
    ${top.length ? `<div><div class="lbl" style="margin-bottom:6px">Routes</div><div class="kv">${top.slice(0, 6).map(r => `<span>${r.a} ⇄ ${r.b} <span class="muted">· ${Math.round(r.lf * 100)}%</span></span><span class="num ${r.profit >= 0 ? 'good' : 'bad'}">${signed(r.profit)}</span>`).join('')}</div>${top.length > 6 ? `<p class="note" style="margin-top:6px">+${top.length - 6} more in Routes</p>` : ''}</div>` : '<p class="muted">No routes flew this quarter. Plan one from the map.</p>'}
    ${rep.milestones && rep.milestones.length ? `<div class="ms">${rep.milestones.map(m => `<div class="on"><b>★ ${esc(m.name)}</b>${esc(m.text)}</div>`).join('')}</div>` : ''}
    ${rep.news.length ? `<div><div class="lbl" style="margin-bottom:8px">Your airline</div><ul class="news">${rep.news.map(n => `<li class="${n.good ? 'good' : n.bad ? 'bad' : ''}">${esc(n.text)}</li>`).join('')}</ul></div>` : ''}
    ${rep.rivals.length ? `<div><div class="lbl" style="margin-bottom:8px">Rivals</div><ul class="news">${rep.rivals.map(m => `<li class="${m.kind === 'attack' || m.kind === 'war' ? 'bad' : ''}"><b style="color:${S.airlines[m.i].color}">${esc(S.airlines[m.i].name)}</b> · ${esc(m.text.replace(S.airlines[m.i].name + ' ', ''))}</li>`).join('')}</ul></div>` : ''}
    ${rep.world.length ? `<div><div class="lbl" style="margin-bottom:8px">World</div><ul class="news">${rep.world.map(w => `<li class="${w.hist ? 'hist' : w.good ? 'good' : w.good === false ? 'bad' : ''}">${esc(w.text)}</li>`).join('')}</ul></div>` : ''}
    <button class="btn primary block" data-act="continue">${ui.queue.length ? 'Continue' : `Plan ${qLabel(S.year, S.q)}`}</button>`);
  sfx('flap');
  setTimeout(() => sfx(rep.milestones && rep.milestones.length ? 'fanfare' : f.profit >= 0 ? 'coin' : 'low'), 520);
}

// Quarterly scorecard: every airline on six measures, scaled so the best on each measure reaches the edge.
function showScorecard(rep) {
  const sc = rep.scores, prev = rep.prevScores;
  const live = S.airlines.map((B, i) => ({ B, i, s: sc[i] })).filter(x => x.s);
  const keys = G.SCORE_KEYS;
  const norm = (k, v) => {
    if (k === 'sat') return v / 100;
    if (k === 'lf') return v;
    const vals = live.map(x => x.s[k]), lo = Math.min(0, ...vals), hi = Math.max(...vals);
    return hi > lo ? (v - lo) / (hi - lo) : 0.5;
  };
  const series = live.map(x => ({ name: x.B.name, color: x.B.color, bold: x.i === 0, values: keys.map(K => norm(K.k, x.s[K.k])) }));
  const rankOf = k => live.slice().sort((a, b) => b.s[k] - a.s[k]).findIndex(x => x.i === 0) + 1;
  const ranks = keys.map(K => rankOf(K.k)), overall = ranks.reduce((t, r) => t + r, 0) / ranks.length;
  const rows = keys.map((K, n) => {
    const max = Math.max(...live.map(x => Math.abs(x.s[K.k]))) || 1;
    const me = sc[0] ? sc[0][K.k] : 0, was = prev && prev[0] ? prev[0][K.k] : null;
    const arrow = was == null ? '' : me > was * 1.01 + 1e-9 ? '<span class="good">▲</span>' : me < was * 0.99 - 1e-9 ? '<span class="bad">▼</span>' : '<span class="muted">–</span>';
    return `<div><b>${K.name}</b><div class="note">#${ranks[n]} · ${K.fmt(me)} ${arrow}</div></div><div class="bars">${live.map(x => `<i style="width:${Math.max(0, x.s[K.k]) / max * 100}%;background:${x.B.color};${x.i === 0 ? '' : 'opacity:.7'}"></i>`).join('')}</div>`;
  }).join('');
  openModal(`
    <p class="lbl">Scorecard · ${qLabel(rep.year, rep.q)}</p>
    <h2>${overall <= 1.5 ? 'You lead the industry' : overall <= 2.3 ? 'Among the leaders' : overall <= 3 ? 'Mid-table' : 'Trailing the pack'}</h2>
    ${sc[0] ? radarChart(keys.map(K => K.name), series) : '<p class="muted">You flew no passengers this quarter.</p>'}
    <div class="rank">${rows}</div>
    <p class="note">Bars compare every airline on each measure. Arrows show your change since last quarter.</p>
    <button class="btn primary block" data-act="continue">Continue</button>`);
}

function showCeremony(rep) {
  const ye = rep.yearEnd, A = ME();
  const awards = [];
  ye.regions.forEach(R => { if (R.leader >= 0) awards.push({ t: REGION[R.id].name, i: R.leader, v: kpax(R.pax[R.leader]) + ' pax' }); });
  const most = ye.totals.indexOf(Math.max(...ye.totals));
  const rich = ye.profits.indexOf(Math.max(...ye.profits));
  const g = ye.goals[0];
  const won = awards.filter(a => a.i === 0).length + (most === 0) + (rich === 0);
  openModal(`
    <p class="lbl">Year-end awards</p>
    <p class="hero-title">${ye.year}</p>
    <div class="ceremony">
      <div class="award" style="border-top-color:${S.airlines[most].color}"><b>Most passengers</b><span>${esc(S.airlines[most].name)} · ${kpax(ye.totals[most])}</span></div>
      <div class="award" style="border-top-color:${S.airlines[rich].color};animation-delay:.1s"><b>Most profitable</b><span>${esc(S.airlines[rich].name)} · ${signed(ye.profits[rich])}</span></div>
      ${awards.map((a, k) => `<div class="award" style="border-top-color:${S.airlines[a.i].color};animation-delay:${0.2 + k * 0.08}s"><b>${a.t}</b><span>${esc(S.airlines[a.i].name)} · ${a.v}</span></div>`).join('')}
    </div>
    ${g ? `<div class="card"><div class="lbl">Your progress to victory</div>
      <div class="kv" style="margin-top:8px">
        <span>Regions with a hub</span><span class="num ${g.hubRegions.length === 7 ? 'good' : ''}">${g.hubRegions.length}/7</span>
        <span>Regions you lead</span><span class="num ${g.leads.length >= S.difficulty ? 'good' : ''}">${g.leads.length}/${S.difficulty}</span>
        <span>Lead your home region</span><span class="num ${g.homeLead ? 'good' : 'bad'}">${g.homeLead ? 'Yes' : 'No'}</span>
        <span>Profitable year</span><span class="num ${g.profit > 0 ? 'good' : 'bad'}">${signed(g.profit)}</span>
      </div></div>` : ''}
    <p class="muted small">${S.end - S.year} year${S.end - S.year === 1 ? '' : 's'} left.</p>
    <button class="btn primary block" data-act="continue">Continue</button>`);
  sfx(won ? 'fanfare' : 'flap');
}

function showMeeting() {
  const cards = S.meeting.map(c => {
    const who = G.ADVISORS[c.who];
    const btn = c.action ? `<button class="chip" data-act="advice" data-k="${c.action.kind}" data-v="${c.action.id || c.action.code || c.action.tab}">Show me</button>` : '';
    return `<div class="card person">${faceSvg(ADVISOR_FACE[c.who], '#8d9cb6', 44)}<div class="quote grow"><div class="who">${who.name} · ${who.role}</div>${esc(c.text)}<div style="margin-top:8px">${btn}</div></div></div>`;
  }).join('');
  const reqs = S.requests.map(q => `<div class="card" style="border-color:var(--amber)"><span class="lbl">${esc(CITY[q.city].name)} · relations ${Math.round(G.rel(S, 0, q.city))}</span>
    <p class="small" style="margin:6px 0">${esc(q.text)}</p><p class="note">${esc(q.effect)}</p>
    <div class="btnrow" style="margin-top:10px"><button class="btn" data-act="req" data-id="${q.id}" data-yes="0">Decline</button><button class="btn primary" data-act="req" data-id="${q.id}" data-yes="1" ${ME().cash < q.cost ? 'disabled' : ''}>${q.cost ? `Pay ${money(q.cost, 0)}` : 'Promise'}</button></div></div>`).join('');
  openModal(`
    <p class="lbl">Board meeting · ${qLabel(S.year, S.q)}</p>
    <h2>What needs your attention</h2>
    ${cards || '<p class="muted">Your advisors have nothing urgent. Keep growing.</p>'}
    ${reqs ? `<h3>Requests</h3>${reqs}` : ''}
    <button class="btn primary block" data-act="continue">Back to work</button>`);
}

function showGameOver() {
  const o = S.over, A = ME();
  const title = o.kind === 'win' ? 'You rule the skies' : o.kind === 'bankrupt' ? 'Grounded' : o.kind === 'lose' ? 'Outflown' : 'Time is up';
  const rank = S.airlines.map((B, i) => ({ B, i, v: B.bankrupt ? 0 : G.companyValue(S, i) })).sort((x, y) => y.v - x.v);
  if (!S.recorded) { S.recorded = true; saveRecord({ name: A.name, era: S.era, result: title, value: Math.round(rank.find(x => x.i === 0).v), year: S.year }); save(); }
  openModal(`<p class="hero-title">${title}</p><p>${esc(o.text)}</p>
    <div class="card"><div class="lbl">Final standings · company value</div><div class="kv" style="margin-top:8px">
      ${rank.map(x => `<span><span class="dot" style="background:${x.B.color}"></span> ${esc(x.B.name)}${x.B.bankrupt ? ' <span class="muted">(bankrupt)</span>' : ''}</span><span class="num">${money(x.v, 0)}</span>`).join('')}
    </div></div>
    <button class="btn primary block" data-act="restart">New game</button>`);
  sfx(o.kind === 'win' ? 'fanfare' : 'low');
}

// ---------- start screen ----------
function showStart() {
  const saved = loadSave(), st = ui.start;
  const era = G.ERA[st.era];
  const homes = CITIES.filter(c => c.major && G.HOME_POOL.includes(c.code));
  if (!homes.find(c => c.code === st.home)) st.home = 'LHR';
  const faces = [7, 19, 33, 48, 61, 77];
  openModal(`
    <p class="hero-title">CONTRAIL<br><span>AIRLINE TYCOON</span></p>
    <p class="muted">Build a world airline from one city across twenty years of history. Win slots, build hubs, connect passengers and outfly three rival CEOs.</p>
    ${saved && !saved.over ? `<button class="btn primary block" data-act="resume">Continue · ${esc(saved.airlines[0].name)} · ${qLabel(saved.year, saved.q)}</button><div class="lbl" style="text-align:center">or start fresh</div>` : ''}
    <div class="field"><span class="lbl">Era</span><div class="eras">
      ${G.ERAS.map(e => `<button class="era" data-act="era" data-e="${e.id}" aria-pressed="${st.era === e.id}"><b>${e.id}</b><strong>${e.name}</strong><small>${e.blurb}</small></button>`).join('')}</div></div>
    <div class="field"><label class="lbl" for="airlineName">Airline name</label><input type="text" id="airlineName" maxlength="24" value="${esc(st.name)}"></div>
    <div class="field"><span class="lbl">Your face</span><div class="row" style="flex-wrap:wrap;gap:6px">
      ${faces.map(f => `<button class="home" style="padding:4px;width:auto" data-act="face" data-f="${f}" aria-pressed="${st.face === f}" aria-label="Portrait ${f}">${faceSvg(f, G.COLORS[0], 44)}</button>`).join('')}</div></div>
    <div class="field"><span class="lbl">Home city</span><div class="homes">
      ${homes.map(c => `<button class="home" data-act="home" data-c="${c.code}" aria-pressed="${st.home === c.code}"><b>${c.code}</b><small>${esc(c.name)}${c.bloc === 'E' && st.era < 1991 ? ' · East' : ''}</small></button>`).join('')}</div>
      <span class="note">${CITY[st.home].bloc === 'E' && st.era < 1991 ? 'Eastern bloc: you buy Soviet aircraft cheaply but Western cities are closed until the Cold War ends.' : CITY[st.home].bloc === 'N' && st.era < 1991 ? 'Non-aligned: you can trade with both blocs.' : 'Starting cash ' + money(era.cash, 0) + '.'}</span></div>
    <div class="field"><span class="lbl">Difficulty · regions you must lead</span><div class="seg">
      ${[[4, 'Easy · 4'], [5, 'Normal · 5'], [6, 'Hard · 6']].map(([d, t]) => `<button data-act="diff" data-d="${d}" aria-pressed="${st.diff === d}">${t}</button>`).join('')}</div></div>
    <details><summary>How to play</summary><ul class="news">
      <li>Each turn is one quarter. Plan, then press <b>End quarter</b> to fly it.</li>
      <li>A route needs weekly slots at both cities and aircraft with the range. Routes start at your hubs.</li>
      <li>Passengers connect through your hubs, so a strong hub feeds every route from it.</li>
      <li>Outside a hub's region you can only fly to major cities. Build a hub there to reach the rest.</li>
      <li>You have 3 negotiators a quarter for slots, hubs and ad campaigns. Good city relations make talks easier.</li>
      <li>Win by building hubs in all 7 regions and leading enough of them in passengers.</li></ul></details>
    <button class="btn primary block" data-act="start">Found ${esc(st.name)} in ${esc(CITY[st.home].name)} · ${st.era}</button>`);
  const inp = $('#airlineName');
  inp.addEventListener('input', () => { st.name = inp.value; $('#modal [data-act=start]').textContent = `Found ${st.name || 'your airline'} in ${CITY[st.home].name} · ${st.era}`; });
}
function startGame() {
  const st = ui.start;
  S = G.newGame({ name: (st.name || '').trim() || 'Contrail Air', ceo: 'You', face: st.face, home: st.home, era: st.era, difficulty: st.diff, seed: Date.now() });
  save(); closeModal(); sfx('jet');
  afterLoad();
}
function afterLoad() {
  ui.tab = 'map'; ui.sheet = null; ui.sel = null; ui.ed = null; ui.queue = [];
  renderAll();
  centerOn(ME().home, Math.max(minZ(), W / 100));
  if (S.over) showGameOver();
}
