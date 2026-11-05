// ---------- modals: start screen, quarter report, year-end ceremony, board meeting, game over ----------
function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card">${html}</div>`;
  m.hidden = false; m.scrollTop = 0;
}
function closeModal() { $('#modal').hidden = true; }

// After a quarter ends: one screen with everything (crisis decision first), then game over if it came.
function nextInQueue() {
  const k = ui.queue.shift();
  ui.inQuarter = false;
  if (!k) { closeModal(); renderAll(); return; }
  if (k === 'quarter') showQuarter(ui.lastRep);
  else if (k === 'over') showGameOver();
}

function flapRow(label, value, color) {
  return `<span>${label}</span><span class="w"${color ? ` style="color:${color}"` : ''}>${value}</span>`;
}
const routeIdFor = (a, b) => { const r = a && S.routes.find(r => r.o === 0 && G.pairKey(r.a, r.b) === G.pairKey(a, b)); return r ? r.id : null; };
const routeLink = (id, label = 'Open route') => (id != null && S.routes.some(r => r.id === id) ? ` <button class="chip" data-act="advice" data-k="route" data-v="${id}">${label}</button>` : '');
const tabLink = (tab, label) => ` <button class="chip" data-act="advice" data-k="tab" data-v="${tab}">${label}</button>`;
const section = (title, body, open, n) => `<details class="qsec"${open ? ' open' : ''}><summary>${title}${n ? ` <span class="pill">${n}</span>` : ''}</summary><div class="qbody">${body}</div></details>`;

// Where route profit goes on its way to the company's bottom line.
function bridgeHtml(f) {
  const rows = [['Route profit <span class="muted">(tickets and cargo − flying costs)</span>', f.rev - (f.freight || 0) - f.flight], ['Freighters', f.freight || 0], ['Aircraft ownership and upkeep', -f.own], ['Aircraft leases', -f.lease],
    ['Slot fees', -f.slots], ['Offices and hubs', -f.overhead], ['Fleet mix: training and spares', -(f.fleetcx || 0)], ['Heavy maintenance checks', -(f.maint || 0)], ['Businesses you own', f.biz], ['Loan and overdraft interest', -f.interest]]
    .filter(([, v], k) => k === 0 || Math.abs(v) >= 0.05);
  return `<div class="kv bridge">${rows.map(([l, v]) => `<span>${l}</span><span class="num ${v >= 0 ? 'good' : 'bad'}">${signed(v)}</span>`).join('')}
    <span><b>Company profit</b></span><span class="num ${f.profit >= 0 ? 'good' : 'bad'}"><b>${signed(f.profit)}</b></span></div>
    <p class="note">Route figures on other screens are before ownership, leases, slots, offices and interest, which is why they add up to more than company profit.</p>`;
}

// From operating profit to the change in the bank balance. Every cash movement is tagged when it
// happens, so the lines add up exactly; the check runs on the unrounded values.
function cashBridgeHtml(b) {
  if (!b) return '<p class="muted small">The cash bridge starts from your next quarter.</p>';
  const order = ['trading', 'subsidy', 'finance', 'fleet', 'slots', 'network', 'deals', 'dividend', 'other'];
  const rows = order.filter(k => k === 'trading' || Math.abs(b.flows[k] || 0) >= 0.005).map(k => [G.FLOW_LABELS[k], b.flows[k] || 0]);
  const ok = Math.abs(b.gap) < 1e-6;
  return `<div class="kv bridge"><span>Opening cash</span><span class="num">${money(b.open, 1)}</span>
    ${rows.map(([l, v]) => `<span>${l}</span><span class="num ${v >= 0 ? 'good' : 'bad'}">${signed(v)}</span>`).join('')}
    <span><b>Quarter-end cash</b></span><span class="num"><b>${money(b.close, 1)}</b></span></div>
    <p class="note">${ok ? 'Reconciled: opening cash plus every line equals quarter-end cash. A crisis choice made in this report is settled in this quarter; anything you buy or negotiate afterwards counts in the next.' : `<span class="bad">Out by ${signed(b.gap)}. Please report this.</span>`} City contract subsidies are paid straight into cash, so they appear here and not in operating profit.</p>`;
}

function urgentItems(rep) {
  const all = urgentAll(rep), sn = S.snooze || {};
  const live = all.filter(u => !u.key || !(sn[u.key] > S.turn));
  // warnings already shown last quarter are folded away unless they are serious
  const seen = (S.alertSeen ||= {});
  const out = [], repeat = [];
  for (const u of live) {
    const was = u.key && seen[u.key];
    if (u.key && (!was || was.at !== S.turn)) seen[u.key] = { at: S.turn, prev: was ? was.at : null };
    const p = u.key && seen[u.key].prev;
    (p != null && p === S.turn - 1 && !u.bad ? repeat : out).push(u);
  }
  for (const k of Object.keys(seen)) if (seen[k].at < S.turn - 4) delete seen[k];
  out.hidden = all.length - live.length; out.repeat = repeat;
  return out;
}
function urgentAll(rep) {
  const out = [], A = ME();
  if (A.cash < 0) out.push({ bad: 1, text: `You're overdrawn at ${money(A.cash)}. Below ${money(-G.creditLimit(S, 0))} the lenders close you down.`, link: tabLink('company', 'Finance') });
  for (const m of rep.rivals.filter(m => m.kind === 'attack' || m.kind === 'war')) out.push({ bad: 1, text: m.text, link: routeLink(routeIdFor(m.a, m.b)) });
  S.airlines.forEach((B, i) => {
    if (i && !B.bankrupt && B.intent && B.intent.kind === 'attack')
      out.push({ warn: 1, key: `intent-${i}-${B.intent.a}-${B.intent.b}`, text: `${B.name}, next quarter: ${B.intent.text}`, link: routeLink(routeIdFor(B.intent.a, B.intent.b), 'Prepare') });
  });
  for (const n of rep.news.filter(n => n.urgent || n.bad)) out.push({ bad: n.bad, key: n.snooze, text: n.text, link: routeLink(n.route) || (n.tab ? tabLink(n.tab, 'Fleet') : '') });
  for (const r of rep.results.filter(r => r.profit < 0).sort((x, y) => x.profit - y.profit).slice(0, 3))
    out.push({ bad: 1, key: `loss-${r.id}`, text: `${r.a}–${r.b} lost ${money(-r.profit)} even before aircraft and fixed costs.`, link: routeLink(r.id) });
  // full routes are covered by the priced moves in "Best moves this quarter"
  const handled = new Set(decisionsList().map(x => x.route));
  for (const r of rep.results.filter(r => r.spill > Math.max(500, r.pax * 0.1) && !handled.has(r.id)).sort((x, y) => y.spill - x.spill).slice(0, 2)) {
    const live = S.routes.find(x => x.id === r.id);
    out.push({ key: `full-${r.id}`, text: `${r.a}–${r.b} was full: ${nf(r.spill)} passengers couldn't get a seat. ${live ? G.fullFix(S, live) : ''}`, link: routeLink(r.id) });
  }
  for (const p of rep.readyPlans || []) out.push({ key: `ready-${p.a}-${p.b}`, text: `Planned route ${p.a}–${p.b} is ready: aircraft and slots are in place.`, link: ` <button class="chip" data-act="planopen" data-a="${p.a}" data-b="${p.b}">Open it</button>` });
  const F = G.cashForecast(S, 0);
  if (F && F.low < 0) out.push({ warn: 1, key: 'forecast', text: `Cash forecast: at this rate you go ${F.low < F.floor ? 'past your overdraft limit' : 'into overdraft'} within a year (lowest ${money(F.low)}).`, link: ` <button class="chip" data-act="fincast">Forecast</button>` });
  const idle = G.surplusTotal(S, 0);
  if (idle) out.push({ key: 'idle', text: `${idle} surplus aircraft sat idle, still costing money (one spare per busy fleet counts as a reserve, not surplus).`, link: tabLink('fleet', 'Fleet') });
  for (const c of S.contracts.filter(c => !G.contractStatus(S, c).ok && S.turn >= c.start - 1))
    out.push({ warn: 1, text: `Contract ${c.city}–${c.other} needs ${c.minFreq} flights a week (now ${G.contractStatus(S, c).flying}).`, link: routeLink(routeIdFor(c.city, c.other)) || ` <button class="chip" data-act="advice" data-k="plan" data-v="${c.city}-${c.other}">Plan it</button>` });
  return out;
}

function crisisHtml() {
  const c = S.crisis, A = ME();
  return `<div class="card crisis"><span class="lbl">Decision needed · ${esc(c.title)}</span><p style="margin:6px 0 4px">${esc(c.text)}</p>
    ${c.estText ? `<p class="small" style="margin:0 0 10px;color:var(--amber)">${esc(c.estText)}</p>` : ''}
    ${c.options.map(o => `<button class="opt" data-act="crisis" data-k="${o.key}" ${A.cash < o.cost ? 'disabled' : ''}><b>${esc(o.label)}${o.cost ? ` · ${money(o.cost)}` : ''}</b><small>${esc(o.desc)}</small></button>`).join('')}</div>`;
}

function scorecardHtml(rep) {
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
  return { verdict: overall <= 1.5 ? 'You lead the industry' : overall <= 2.3 ? 'Among the leaders' : overall <= 3 ? 'Mid-table' : 'Trailing the pack',
    html: `${radarChart(keys.map(K => K.name), series)}<div class="rank">${rows}</div><p class="note">Bars compare every airline on each measure. Arrows show your change since last quarter. This rates how well the airline runs this quarter; it is not your objective or company value. You can trail here and still be winning the campaign.</p>` };
}

function objectiveHtml(useLast) {
  const checks = G.objectiveChecks(S, 0, useLast), O = G.OBJECTIVES[S.goal || 'world'];
  return `<div class="kv">${checks.map(c => `<span>${esc(c.label)}</span><span class="num ${c.ok ? 'good' : ''}">${esc(c.val)}</span>`).join('')}</div>
    <p class="note">${esc(O.name)}: ${esc(O.blurb)} Deadline: end of ${S.end - 1}.</p>`;
}

function ceremonyHtml(rep) {
  const ye = rep.yearEnd;
  const awards = [];
  ye.regions.forEach(R => { if (R.leader >= 0) awards.push({ t: REGION[R.id].name, i: R.leader, v: kpax(R.pax[R.leader]) + ' pax' }); });
  const most = ye.totals.indexOf(Math.max(...ye.totals)), rich = ye.profits.indexOf(Math.max(...ye.profits));
  return `<div class="ceremony">
      <div class="award" style="border-top-color:${S.airlines[most].color}"><b>Most passengers</b><span>${esc(S.airlines[most].name)} · ${kpax(ye.totals[most])}</span></div>
      <div class="award" style="border-top-color:${S.airlines[rich].color};animation-delay:.1s"><b>Most profitable</b><span>${esc(S.airlines[rich].name)} · ${signed(ye.profits[rich])}</span></div>
      ${awards.map((a, k) => `<div class="award" style="border-top-color:${S.airlines[a.i].color};animation-delay:${0.2 + k * 0.08}s"><b>${a.t}</b><span>${esc(S.airlines[a.i].name)} · ${a.v}</span></div>`).join('')}
    </div>
    <div class="lbl" style="margin:10px 0 6px">Your objective at year end</div>${objectiveHtml(true)}
    <p class="muted small">${S.end - S.year} year${S.end - S.year === 1 ? '' : 's'} left.</p>`;
}

function advisorHtml() {
  const A = ME(), focus = A.focus || 'profit';
  const cards = S.meeting.map(c => {
    const who = G.ADVISORS[c.who];
    const btn = c.action ? `<button class="chip" data-act="advice" data-k="${c.action.kind}" data-v="${c.action.id || c.action.code || c.action.tab}">Show me</button>` : '';
    return `<div class="card person">${faceSvg(ADVISOR_FACE[c.who], '#8d9cb6', 40)}<div class="quote grow"><div class="who">${who.name} · ${who.role}</div>${esc(c.text)}<div style="margin-top:8px">${btn}</div></div></div>`;
  }).join('');
  return `${cards || '<p class="muted">Your advisors have nothing urgent.</p>'}${planHtml(focus)}`;
}
// The advisors' plan for one goal. Shared with the Company screen.
function planHtml(focus) {
  const steps = G.advisorPlan(S, focus);
  const go = a => !a ? '' : a.kind === 'plan' ? `<button class="chip" data-act="advice" data-k="plan" data-v="${a.a}-${a.b}">Plan it</button>`
    : `<button class="chip" data-act="advice" data-k="${a.kind}" data-v="${a.id || a.code || a.tab}">Show me</button>`;
  return `<div class="card"><span class="lbl">Advisors' plan · goal</span>
    <div class="seg" style="margin:8px 0">${Object.entries(G.FOCUS).map(([k, F]) => `<button data-act="focus" data-v="${k}" aria-pressed="${focus === k}">${F.name}</button>`).join('')}</div>
    <p class="note">${esc(G.FOCUS[focus].blurb)} The route advisor now weighs its suggestions toward this goal.</p>
    <ol class="plan">${steps.map(x => `<li>${esc(x.text)} ${go(x.action)}</li>`).join('')}</ol></div>`;
}

function requestsHtml() {
  return S.requests.map(q => `<div class="card" style="border-color:var(--amber)"><span class="lbl">${esc(CITY[q.city].name)} · relations ${Math.round(G.rel(S, 0, q.city))}${q.kind === 'contract' ? ' · contract' : ''}</span>
    <p class="small" style="margin:6px 0">${esc(q.text)}</p><p class="note">${esc(q.effect)}</p>
    <div class="btnrow" style="margin-top:10px"><button class="btn" data-act="req" data-id="${q.id}" data-yes="0">Decline</button><button class="btn primary" data-act="req" data-id="${q.id}" data-yes="1" ${ME().cash < q.cost ? 'disabled' : ''}>${q.cost ? `Pay ${money(q.cost, 0)}` : q.kind === 'contract' ? 'Sign' : 'Promise'}</button></div></div>`).join('');
}

function rivalsHtml(rep) {
  const seen = new Set();
  const moves = rep.rivals.map(m => {
    const id = routeIdFor(m.a, m.b), r = id != null && S.routes.find(x => x.id === id);
    const imp = r && !seen.has(id) && ['attack', 'war', 'follow', 'hold'].includes(m.kind) ? (seen.add(id), impactHtml(r, true)) : '';
    return `<li class="${m.kind === 'attack' || m.kind === 'war' ? 'bad' : ''}"><b style="color:${S.airlines[m.i].color}">${esc(S.airlines[m.i].name)}</b> · ${esc(m.text.replace(S.airlines[m.i].name + ' ', ''))}${routeLink(id)}${imp ? `<div style="color:var(--text)"><div class="lbl" style="margin-top:6px">Your ${m.a}–${m.b} this quarter vs last</div>${imp}</div>` : ''}</li>`;
  }).join('');
  const next = S.airlines.map((B, i) => (i && !B.bankrupt && B.intent ? `<li class="${B.intent.kind === 'attack' ? 'bad' : ''}"><b style="color:${B.color}">${esc(B.name)}</b> · ${esc(B.intent.text)}</li>` : '')).join('');
  return `${moves ? `<ul class="news">${moves}</ul>` : '<p class="muted small">Rivals were quiet.</p>'}<div class="lbl" style="margin:10px 0 6px">Expected next quarter</div><ul class="news">${next}</ul>`;
}

function showQuarter(rep) {
  $('#toast').hidden = true;
  ui.inQuarter = true;
  const A = ME();
  if (!rep) { // a decision waiting in a loaded game
    openModal(`<p class="lbl">${qLabel(S.year, S.q)}</p>${crisisHtml()}`);
    return;
  }
  const f = rep.fin, urgentOnly = !!prefs.urgentOnly;
  const res = rep.results.slice().sort((x, y) => y.profit - x.profit);
  const conn = f.conn != null ? f.conn : res.reduce((t, r) => t + (r.conn || 0), 0) / 2;
  const board = `<div class="board flip">
      <span class="h">${qLabel(rep.year, rep.q)} · results</span>
      ${flapRow('Journeys', nf(f.pax))}
      ${conn ? flapRow('  connecting', nf(conn)) : ''}
      ${flapRow('Revenue', money(f.rev + Math.max(0, f.biz)))}
      ${flapRow('Costs', '−' + money(f.cost + Math.max(0, -f.biz)))}
      ${flapRow('Profit', signed(f.profit), f.profit >= 0 ? '#52d18e' : '#ef6f6c')}
      ${flapRow('Quarter-end cash', money(rep.bridge ? rep.bridge.close : A.cash))}
      ${rep.bridge && Math.abs(A.cash - rep.bridge.close) >= 0.05 ? flapRow('  cash now', money(A.cash)) : ''}
    </div>`;
  if (S.crisis) { openModal(`${board}${crisisHtml()}`); sfx('low'); return; }
  const urgent = urgentItems(rep);
  const urgentBox = `<div class="card urgent"><span class="lbl">Needs attention</span>${urgent.length
    ? `<ul class="news" style="margin-top:6px">${urgent.map(u => `<li class="${u.bad ? 'bad' : u.warn ? 'warn' : ''}">${esc(u.text)}${u.link || ''}${u.key ? ` <button class="chip snz" data-act="snooze" data-k="${esc(u.key)}" title="Hide this warning for four quarters">Snooze</button>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted small" style="margin-top:6px">Nothing new this quarter.</p>'}${urgent.repeat.length ? `<details><summary class="small">Still open from last quarter (${urgent.repeat.length})</summary><ul class="news" style="margin-top:6px">${urgent.repeat.map(u => `<li>${esc(u.text)}${u.link || ''} <button class="chip snz" data-act="snooze" data-k="${esc(u.key)}">Snooze</button></li>`).join('')}</ul></details>` : ''}${urgent.hidden ? `<p class="note">${urgent.hidden} snoozed warning${urgent.hidden > 1 ? 's' : ''} hidden.</p>` : ''}</div>`;
  const reqs = requestsHtml();
  const ms = rep.milestones && rep.milestones.length ? `<div class="ms">${rep.milestones.map(m => `<div class="on"><b>★ ${esc(m.name)}</b>${esc(m.text)}</div>`).join('')}</div>` : '';
  let more = '';
  if (!urgentOnly) {
    const sc = rep.scores && rep.scores[0] ? scorecardHtml(rep) : null;
    more = [
      rep.yearEnd ? section(`Year-end awards ${rep.yearEnd.year}`, ceremonyHtml(rep), true) : '',
      section('Where the profit went', bridgeHtml(f), false),
      section('From profit to cash', cashBridgeHtml(rep.bridge), false),
      section('Routes', res.length ? `<div class="kv">${res.map(r => `<span>${r.a} ⇄ ${r.b} <span class="muted">· ${Math.round(r.lf * 100)}%</span>${routeLink(r.id, 'Open')}</span><span class="num ${r.profit >= 0 ? 'good' : 'bad'}">${signed(r.profit)}</span>`).join('')}</div><p class="note">Route profit is before aircraft, slot and office costs.</p>` : '<p class="muted">No routes flew this quarter.</p>', false, res.length),
      rep.news.length ? section('Your airline', `<ul class="news">${rep.news.map(n => `<li class="${n.good ? 'good' : n.bad ? 'bad' : ''}">${esc(n.text)}${routeLink(n.route)}</li>`).join('')}</ul>`, false, rep.news.length) : '',
      section('Rivals', rivalsHtml(rep), false, rep.rivals.length),
      rep.world.length ? section('World', `<ul class="news">${rep.world.map(w => `<li class="${w.hist ? 'hist' : w.good ? 'good' : w.good === false ? 'bad' : ''}">${esc(w.text)}</li>`).join('')}</ul>`, false, rep.world.length) : '',
      sc ? section(`Operations scorecard · ${sc.verdict}`, sc.html, false) : '',
      section('Advisors', advisorHtml(), false, S.meeting.length),
    ].join('');
  }
  openModal(`${board}${ms}${raceHtml()}${urgentBox}${decisionsHtml(false)}${reqs ? `<h3>Requests</h3>${reqs}` : ''}${more}
    <div class="row" style="justify-content:space-between;align-items:center;margin-top:4px"><button class="chip" data-act="urgent" aria-pressed="${urgentOnly}">${urgentOnly ? '✓ ' : ''}Only urgent issues</button>
    <span class="note">${urgentOnly ? 'Full report hidden' : 'Tap a section to open it'}</span></div>
    <div class="sticky-foot"><button class="btn primary block" data-act="continue">${ui.queue.length ? 'Continue' : `Plan ${qLabel(S.year, S.q)}`}</button></div>`);
  sfx('flap');
  setTimeout(() => sfx(ms ? 'fanfare' : f.profit >= 0 ? 'coin' : 'low'), 520);
}

function showGameOver() {
  const o = S.over, A = ME();
  const title = o.kind === 'win' ? 'You rule the skies' : o.kind === 'bankrupt' ? 'Grounded' : o.kind === 'lose' ? 'Outflown' : o.kind === 'fired' ? 'Replaced by the board' : 'Time is up';
  const rank = S.airlines.map((B, i) => ({ B, i, v: B.bankrupt ? 0 : G.companyValue(S, i) })).sort((x, y) => y.v - x.v);
  if (!S.recorded) { S.recorded = true; saveRecord({ name: A.name, era: S.era, result: title, value: Math.round(rank.find(x => x.i === 0).v), year: S.year }); save(); }
  const canSandbox = o.kind === 'win' && !S.sandbox && S.year < S.end;
  openModal(`<p class="hero-title">${title}</p><p>${esc(o.text)}</p>
    ${A.lastYr && (S.goal || 'world') !== 'value' ? `<div class="card"><div class="lbl">Objective at the end of ${S.year - 1}</div><div style="margin-top:8px">${objectiveHtml(true)}</div></div>` : ''}
    ${(() => { const D = G.debrief(S, 0); return D ? `<div class="card"><div class="lbl">Debrief</div><ul class="news" style="margin-top:6px">${D.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''; })()}
    <div class="card"><div class="lbl">Final standings · company value</div><div class="kv" style="margin-top:8px">
      ${rank.map(x => `<span><span class="dot" style="background:${x.B.color}"></span> ${esc(x.B.name)}${x.B.bankrupt ? ' <span class="muted">(bankrupt)</span>' : ''}</span><span class="num">${money(x.v, 0)}</span>`).join('')}
    </div></div>
    ${canSandbox ? `<button class="btn primary block" data-act="sandbox">Keep flying (sandbox to ${S.end - 1})</button><p class="note" style="text-align:center">Your win is recorded. Play on through the later years, aircraft and events.</p>` : ''}
    <button class="btn ${canSandbox ? '' : 'primary'} block" data-act="restart">New game</button>`);
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
    <p class="hero-title">GOLDEN ROUTE<br><span>AIRLINE EMPIRE</span></p>
    <p class="muted">Build a world airline from one city across twenty years of history. Win slots, build hubs, connect passengers and outfly three rival CEOs.</p>
    ${saved && !saved.over ? `<button class="btn primary block" data-act="resume">Continue · ${esc(saved.airlines[0].name)} · ${qLabel(saved.year, saved.q)}</button><div class="lbl" style="text-align:center">or start fresh</div>` : ''}
    <div class="field"><span class="lbl">Game</span><div class="seg">
      <button data-act="mode" data-v="campaign" aria-pressed="${!st.scenario}">Full campaign</button><button data-act="mode" data-v="scenario" aria-pressed="${!!st.scenario}">Short scenario</button></div></div>
    ${st.scenario ? `<div class="field"><span class="lbl">Scenario</span><div class="eras">
      ${G.SCENARIOS.map(x => `<button class="era" data-act="scen" data-s="${x.id}" aria-pressed="${st.scenario === x.id}"><b>${x.start}</b><strong>${esc(x.name)}</strong><small>${esc(x.blurb)} ${x.years} years · ${esc(CITY[x.home].name)} · goal: ${esc(G.OBJECTIVES[x.goal].name)}.</small></button>`).join('')}</div></div>` : `
    <div class="field"><span class="lbl">Era</span><div class="eras">
      ${G.ERAS.map(e => `<button class="era" data-act="era" data-e="${e.id}" aria-pressed="${st.era === e.id}"><b>${e.id}</b><strong>${e.name}</strong><small>${e.blurb}</small></button>`).join('')}</div></div>`}
    <div class="field"><label class="lbl" for="airlineName">Airline name</label><input type="text" id="airlineName" maxlength="24" value="${esc(st.name)}"></div>
    <div class="field"><span class="lbl">Your face</span><div class="row" style="flex-wrap:wrap;gap:6px">
      ${faces.map(f => `<button class="home" style="padding:4px;width:auto" data-act="face" data-f="${f}" aria-pressed="${st.face === f}" aria-label="Portrait ${f}">${faceSvg(f, G.COLORS[0], 44)}</button>`).join('')}</div></div>
    ${st.scenario ? '' : `<div class="field"><span class="lbl">Objective</span><div class="eras">
      ${['world', 'regional', 'premium', 'lowcost'].map(k => `<button class="era" data-act="goal" data-g="${k}" aria-pressed="${(st.goal || 'world') === k}"><strong>${G.OBJECTIVES[k].name}</strong><small>${G.OBJECTIVES[k].blurb}</small></button>`).join('')}</div></div>
    <div class="field"><span class="lbl">Home city</span><div class="homes">
      ${homes.map(c => `<button class="home" data-act="home" data-c="${c.code}" aria-pressed="${st.home === c.code}"><b>${c.code}</b><small>${esc(c.name)}${c.bloc === 'E' && st.era < 1991 ? ' · East' : ''}</small></button>`).join('')}</div>
      <span class="note">${CITY[st.home].bloc === 'E' && st.era < 1991 ? 'Eastern bloc: you buy Soviet aircraft cheaply but Western cities are closed until the Cold War ends.' : CITY[st.home].bloc === 'N' && st.era < 1991 ? 'Non-aligned: you can trade with both blocs.' : 'Starting cash ' + money(era.cash, 0) + '.'}</span></div>
    ${(st.goal || 'world') === 'world' ? `<div class="field"><span class="lbl">Difficulty · regions you must lead</span><div class="seg">
      ${[[4, 'Easy · 4'], [5, 'Normal · 5'], [6, 'Hard · 6']].map(([d, t]) => `<button data-act="diff" data-d="${d}" aria-pressed="${st.diff === d}">${t}</button>`).join('')}</div></div>` : ''}`}
    ${rulesCard()}
    <details><summary>How to play</summary><ul class="news">
      <li>Each turn is one quarter. Plan, then press <b>End quarter</b> to fly it.</li>
      <li>A route needs weekly slots at both cities and aircraft with the range. Routes start at your hubs.</li>
      <li>Passengers connect through your hubs, so a strong hub feeds every route from it.</li>
      <li>Outside a hub's region you can only fly to major cities. Build a hub there to reach the rest.</li>
      <li>You have 3 negotiators a quarter for slots, hubs and ad campaigns. Good city relations make talks easier.</li>
      <li>Win by building hubs in all 7 regions, a network of dozens of routes, and a commanding lead in enough regions, held for consecutive years. Or pick another objective.</li></ul></details>
    <button class="btn primary block" data-act="start">${startLabel()}</button>`);
  const inp = $('#airlineName');
  inp.addEventListener('input', () => { st.name = inp.value; $('#modal [data-act=start]').textContent = startLabel(); });
}
function rulesCard() {
  const st = ui.start, sc = st.scenario && G.SCENARIO[st.scenario];
  const goal = sc ? sc.goal : st.goal || 'world', diff = sc ? 5 : st.diff;
  const rules = G.objectiveRules(goal, diff, sc ? sc.id : null);
  const years = sc ? sc.years : 20;
  const stages = goal === 'value' ? '' : goal === 'world' ? 'Foothold › Regional power › Intercontinental › World airline › Champion' : `Getting established › Growing › ${G.OBJECTIVES[goal].name} › Champion`;
  return `<div class="card"><span class="lbl">What winning takes · ${esc(G.OBJECTIVES[goal].name)}${goal === 'world' && !sc ? ` · ${['', '', '', '', 'Easy', 'Normal', 'Hard'][diff]}` : ''}</span>
    <ol class="plan" style="margin-top:6px">${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
    <p class="note">${sc ? `You have ${years} years.` : `You have ${years} years. Most winning campaigns take around fifteen.`}${stages ? ` Stages on the way: ${stages}. The Company screen tracks them.` : ''}</p></div>`;
}
function startLabel() {
  const st = ui.start, sc = st.scenario && G.SCENARIO[st.scenario];
  return sc ? `Fly ${st.name || 'your airline'} from ${CITY[sc.home].name} · ${sc.start}` : `Found ${st.name || 'your airline'} in ${CITY[st.home].name} · ${st.era}`;
}
function startGame() {
  const st = ui.start;
  S = G.newGame({ name: (st.name || '').trim() || 'Golden Air', ceo: 'You', face: st.face, home: st.home, era: st.era, difficulty: st.diff, goal: st.goal || 'world', scenario: st.scenario || null, seed: Date.now() });
  save(); closeModal(); sfx('jet');
  afterLoad();
}
function afterLoad() {
  ui.tab = 'map'; ui.sheet = null; ui.sel = null; ui.ed = null; ui.queue = [];
  renderAll();
  centerOn(ME().home, Math.max(minZ(), W / 100));
  if (S.over) showGameOver();
  else if (S.crisis) showQuarter(null);
}
