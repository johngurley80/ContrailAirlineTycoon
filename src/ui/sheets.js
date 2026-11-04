// ---------- bottom sheets: city and route planner ----------
function onCityTap(code) {
  if (ui.sheet === 'route' && ui.ed && !ui.ed.id && ui.ed.a && code !== ui.ed.a && G.originsFor(S, 0, code).includes(ui.ed.a)) {
    ui.ed.b = code; fitEditorType(); ui.sel = code; renderSheet(); draw(); return;
  }
  ui.sel = code; ui.sheet = 'city'; ui.ed = null;
  renderSheet(); renderTop(); draw();
}
function openCity(code) {
  if (ui.tab !== 'map') { ui.tab = 'map'; renderAll(); }
  ui.sel = code; ui.sheet = 'city'; ui.ed = null;
  renderSheet(); renderTop(); centerOn(code);
}
function closeSheet(silent) {
  ui.sheet = null; ui.sel = null; ui.ed = null; ui.confirmClose = false;
  $('#sheet').hidden = true;
  if (!silent) { renderTop(); draw(); }
}
function renderSheet() {
  const el = $('#sheet');
  if (!ui.sheet) { el.hidden = true; return; }
  const keep = el.hidden ? 0 : el.scrollTop;
  el.hidden = false;
  el.innerHTML = `<div class="sheet-in"><div class="grab"></div>${ui.sheet === 'city' ? citySheet(ui.sel) : ui.sheet === 'find' ? finderSheet() : routeSheet()}</div>`;
  el.scrollTop = keep;
}

function relMeter(v) {
  const color = v >= 55 ? 'var(--good)' : v >= 35 ? 'var(--amber)' : 'var(--bad)';
  return `<div class="meter"><i style="width:${v}%;background:${color}"></i></div>`;
}

function citySheet(code) {
  const c = CITY[code], A = ME(), st = G.cityStats(S, code);
  const held = G.slotsHeld(S, 0, code), used = G.slotsUsed(S, 0, code), free = G.airportFree(S, code);
  const hubs = S.airlines.map((B, i) => (!B.bankrupt && B.hubs.includes(code) ? i : -1)).filter(i => i >= 0);
  const evs = S.events.filter(e => (e.kind === 'city' && e.city === code) || (e.kind === 'region' && e.region === c.region) || e.kind === 'world');
  const carriers = S.airlines.map((B, i) => ({ B, i, n: S.routes.filter(r => r.o === i && (r.a === code || r.b === code)).length })).filter(x => x.n && x.i !== 0);
  const myRoutes = G.routesOf(S, 0).filter(r => r.a === code || r.b === code);
  const origins = G.originsFor(S, 0, code);
  const pend = A.pending.find(p => p.city === code);
  const hubBlk = G.hubBlock(S, 0, code);
  const agents = G.agentsLeft(S, 0);
  const rel = Math.round(G.rel(S, 0, code));
  const closed = G.cityClosed(S, 0, code);
  const clash = G.coldWar(S) && G.blocClash(A.bloc, c.bloc);
  const req = S.requests.find(q => q.city === code);
  let routeBox;
  if (origins.length) {
    const o = origins[0], d = G.dist(o, code);
    routeBox = `<div class="card"><div class="row"><div class="grow"><span class="lbl">From ${o}</span><div class="num small" style="margin-top:4px">${nf(d)} km · ~${nf(G.baseDemand(S, o, code))} travellers/wk each way</div></div>
      <div class="btnrow" style="flex:0 0 auto">${plannedHas(o, code) ? '<span class="tag blue">Planned</span>' : `<button class="btn" data-act="addplan" data-a="${o}" data-b="${code}">Plan for later</button>`}<button class="btn primary" data-act="plan" data-from="${o}">Plan route</button></div></div></div>`;
  } else if (A.hubs.includes(code)) routeBox = `<p class="muted small">This is your hub. Tap another city to plan a route from here.</p>`;
  else routeBox = `<p class="muted small">${esc(G.routeBlock(S, 0, A.hubs[0], code) || '')}</p>`;

  const plots = G.bizAt(S, code);
  const plotHtml = Array.from({ length: G.BIZ_SLOTS }, (_, k) => {
    const b = plots[k];
    if (!b) return `<div class="plot muted">Empty plot</div>`;
    const B = BUSINESSES[b.type], mine = b.o === 0;
    return `<div class="plot taken" style="border-top:3px solid ${S.airlines[b.o].color}"><b>${B.name}</b><span class="muted">${mine ? `You · ${signed(G.bizIncome(S, code, b))}/q` : esc(S.airlines[b.o].name)}</span>${mine ? `<button class="chip" style="margin-top:4px;padding:2px 8px" data-act="sellbiz" data-t="${b.type}">Sell ${money(B.cost * 0.7, 0)}</button>` : ''}</div>`;
  }).join('');
  const buyList = Object.entries(BUSINESSES).map(([k, B]) => {
    const blk = G.bizBlock(S, 0, code, k);
    const est = G.bizIncome(S, code, { o: 0, type: k });
    return `<div class="row" style="align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)"><div class="grow"><b>${B.name}</b> <span class="num muted small">${money(B.cost, 0)} · ~${signed(est)}/q</span><div class="note">${esc(blk || B.blurb)}</div></div>
      <button class="btn" data-act="buybiz" data-t="${k}" ${blk || A.cash < B.cost ? 'disabled' : ''}>Buy</button></div>`;
  }).join('');

  return `
  <div class="sh-head"><div class="t"><div class="code">${code}</div><div class="sub">${esc(c.name)} · ${REGION[c.region].name}</div></div><button class="x" data-act="close" aria-label="Close">×</button></div>
  <div class="chips">${c.major ? '<span class="chip">Major city</span>' : '<span class="chip">Regional city</span>'}
    ${closed ? `<span class="chip warn">Closed to foreign airlines until ${c.opens}</span>` : ''}
    ${clash ? '<span class="chip warn">Across the Iron Curtain</span>' : ''}
    ${hubs.map(i => `<span class="chip ${i === 0 ? 'hub' : ''}"><span class="dot" style="background:${S.airlines[i].color}"></span>${i === 0 ? 'Your hub' : esc(S.airlines[i].name) + ' hub'}</span>`).join('')}
    ${evs.map(e => `<span class="chip ev">${e.mult > 1 ? '▲' : '▼'} ${Math.round(Math.abs(e.mult - 1) * 100)}% · ${e.left}q</span>`).join('')}</div>
  <div class="stats">
    <div class="stat"><small>Population</small><b>${st.pop.toFixed(1)}M</b></div>
    <div class="stat"><small>Economy</small><b>${st.econ.toFixed(1)}</b>${relMeter(st.econ * 10).replace('var(--good)', 'var(--amber)').replace('var(--bad)', 'var(--amber)')}</div>
    <div class="stat"><small>Tourism</small><b>${st.tour}/10</b><div class="meter"><i style="width:${st.tour * 10}%"></i></div></div>
  </div>
  <div class="card"><div class="row"><div class="grow"><span class="lbl">Relations with you</span><div style="margin-top:4px"><b class="num">${rel}</b> <span class="muted small">· ${G.relLabel(rel)} · slot talks ${Math.round(G.slotOdds(S, 0, code) * 100)}% likely to succeed</span></div>${relMeter(rel)}</div></div></div>
  ${req ? `<div class="card" style="border-color:var(--amber)"><span class="lbl">Request from the city</span><p style="margin:6px 0">${esc(req.text)}</p><p class="note">${esc(req.effect)}</p>
    <div class="btnrow" style="margin-top:10px"><button class="btn" data-act="req" data-id="${req.id}" data-yes="0">Decline</button><button class="btn primary" data-act="req" data-id="${req.id}" data-yes="1">${req.cost ? `Pay ${money(req.cost, 0)}` : 'Promise'}</button></div></div>` : ''}
  ${routeBox}
  <div class="card stack">
    <div class="row"><div class="grow"><span class="lbl">Your weekly slots</span><div class="num small" style="margin-top:4px">${held} held · ${used} in use · <b>${held - used} free</b></div></div>
      <div style="text-align:right"><span class="lbl">Airport</span><div class="num small" style="margin-top:4px">${Math.max(0, free)}/${S.cap[code]} free</div></div></div>
    ${pend ? `<p class="muted small">A negotiator is working here. ${pend.kind === 'hub' ? 'Your hub opens' : `Results for ${pend.n} slots come`} at the end of the quarter.</p>` : closed ? '' : `
    <div class="seg">${[5, 10, 20].map(n => `<button data-act="slotn" data-n="${n}" aria-pressed="${ui.slotN === n}">${n} · ${money(G.slotPrice(S, code) * n)}</button>`).join('')}</div>
    <button class="btn block" data-act="slots" ${agents ? '' : 'disabled'}>${agents ? `Send a negotiator (${agents} free)` : 'No negotiators free this quarter'}</button>
    <span class="note">Deposit now. If talks fail you get 80% back. Rivals bidding here at the same time compete for the free slots.</span>`}
  </div>
  ${slotMarketHtml(code, closed || clash)}
  ${A.hubs.includes(code) || !c.major ? '' : `<div class="card"><div class="row"><div class="grow"><span class="lbl">Regional hub</span><p class="muted small" style="margin-top:4px">${hubBlk ? esc(hubBlk) : `Opens all of ${REGION[c.region].name} to you, and lets passengers connect here. Ready next quarter.`}</p></div>
    ${hubBlk ? '' : `<button class="btn primary" data-act="hub" ${agents ? '' : 'disabled'}>Build · ${money(G.hubPrice(S, code), 0)}</button>`}</div></div>`}
  <div class="card stack"><span class="lbl">Businesses · ${plots.length}/${G.BIZ_SLOTS} plots used</span><div class="plots">${plotHtml}</div>
    <details><summary>Buy a business here</summary>${buyList}</details></div>
  ${myRoutes.length ? `<h3>Your routes here</h3>${myRoutes.map(routeCard).join('')}` : ''}
  ${carriers.length ? `<h3>Rivals here</h3><div class="chips">${carriers.map(x => `<span class="chip"><span class="dot" style="background:${x.B.color}"></span>${esc(x.B.name)} · ${x.n} route${x.n > 1 ? 's' : ''}</span>`).join('')}</div>` : ''}`;
}

// Peak-time upgrades for slots you hold, and spare slots rivals will sell.
function slotMarketHtml(code, closed) {
  if (closed) return '';
  const A = ME(), held = G.slotsHeld(S, 0, code), pk = G.peakHeld(S, 0, code), pkUsed = G.peakUsed(S, 0, code), pkFree = Math.max(0, G.peakFree(S, code));
  const offers = G.slotOffers(S, 0, code), price = G.peakPrice(S, code);
  if (!held && !offers.length) return '';
  return `<div class="card stack"><span class="lbl">Peak times & slot market</span>
    ${held ? `<p class="small">Peak slots: you hold <b>${pk}</b> (${pkUsed} in use) of your ${held}. ${pkFree} peak slots left at this airport.</p>
      <div class="btnrow">${[2, 5, 10].map(n => `<button class="btn" data-act="buypeak" data-n="${n}" ${n <= Math.min(pkFree, held - pk) && A.cash >= price * n ? '' : 'disabled'}>Upgrade ${n} · ${money(price * n)}</button>`).join('')}</div>
      <p class="note">Routes set to peak times win more business travellers and a little satisfaction. Each weekly flight needs a peak slot at both ends.</p>` : ''}
    ${offers.map(o => { const n = Math.min(o.n, 5), B = S.airlines[o.j]; return `<div class="row" style="padding-top:6px;border-top:1px solid var(--line)"><div class="grow small"><span class="dot" style="background:${B.color}"></span> ${esc(B.name)} will sell up to ${o.n} spare slots at ${money(o.unit)} each${G.allied(S, o.j) ? ' (partner price)' : ''}</div>
      <button class="btn" data-act="buyslots" data-j="${o.j}" data-n="${n}" ${A.cash >= o.unit * n ? '' : 'disabled'}>Buy ${n} · ${money(o.unit * n)}</button></div>`; }).join('')}
    ${offers.length ? '<p class="note">Bought slots are yours at once: no negotiator, no waiting. Rivals charge a premium.</p>' : ''}</div>`;
}

// ---------- route planner ----------
function avail(type) {
  const ed = ui.ed, old = ed.id ? S.routes.find(r => r.id === ed.id) : null;
  return G.idle(S, 0, type) + (old && old.type === type ? old.planes : 0);
}
function fitEditorType() {
  const ed = ui.ed; if (!ed.b) return;
  const d = G.dist(ed.a, ed.b);
  const ok = G.fleetTypes(ME()).map(t => PLANE[t]).filter(p => p.range >= d && avail(p.id) > 0);
  if (!ok.find(p => p.id === ed.type)) ed.type = ok.length ? ok.sort((x, y) => y.seats - x.seats)[0].id : null;
  clampEditor();
}
function limits() {
  const ed = ui.ed, d = G.dist(ed.a, ed.b);
  const byPlanes = ed.type ? G.maxFreq(ed.type, ed.planes, d) : 0;
  const sa = G.slotsAvail(S, 0, ed.a, ed.id), sb = G.slotsAvail(S, 0, ed.b, ed.id);
  return { byPlanes, sa, sb, max: Math.max(0, Math.min(byPlanes, sa, sb)) };
}
function clampEditor() {
  const ed = ui.ed;
  if (!ed.type) return;
  ed.planes = Math.max(1, Math.min(avail(ed.type), ed.planes || 1));
  ed.freq = Math.max(1, Math.min(limits().max || 1, ed.freq || 7));
}
function openEditor(a, b, id) {
  if (id) {
    const r = S.routes.find(x => x.id === id);
    ui.ed = { id, a: r.a, b: r.b, type: r.type, planes: r.planes, freq: r.freq, fare: r.fare, svc: r.svc ?? 1, cab: r.cab || 0, peak: !!r.peak };
  } else {
    ui.ed = { id: null, a, b, type: null, planes: 1, freq: 7, fare: 0, svc: 1, cab: 0, peak: false };
    fitEditorType();
    resuggest();
  }
  ui.sheet = 'route'; ui.sel = ui.ed.b; ui.confirmClose = false; ui.advice = null;
  if (ui.tab !== 'map') { ui.tab = 'map'; renderAll(); }
  renderSheet(); renderTop(); draw();
}
// Re-plan frequency and aircraft count for the current origin and aircraft, keeping fare, service,
// cabin and peak settings. Called on opening a new route, changing origin or type, or on request.
function resuggest(why) {
  const ed = ui.ed;
  if (!ed || !ed.type || !ed.b) return;
  const best = G.suggestSchedule(S, 0, { ...ed }, { maxPlanes: avail(ed.type), exceptId: ed.id ?? undefined });
  if (best) { ed.planes = best.planes; ed.freq = best.freq; }
  clampEditor();
  ed.sugg = why || 'auto';
}
// Aircraft facts for the planner: what it is, what it costs and what it could do on this route.
const planeInfoCache = new Map();
function planeInfo(t) {
  const ed = ui.ed, P = PLANE[t], A = ME();
  if (!ed || !P) return '';
  const d = G.dist(ed.a, ed.b), seats = G.seatsOn({ type: t, cab: ed.cab || 0 }), biz = G.bizSeatsOn({ type: t, cab: ed.cab || 0 });
  const key = [t, ed.a, ed.b, S.turn, ed.cab || 0, ed.fare, ed.svc, ed.id].join(':');
  let best = planeInfoCache.get(key);
  if (best === undefined) { best = G.suggestSchedule(S, 0, { ...ed, type: t }, { maxPlanes: avail(t), exceptId: ed.id ?? undefined }); planeInfoCache.set(key, best); }
  const R = G.reliability(S, 0, t), n = G.fleetCount(A, t);
  return `<div class="row"><b class="grow" style="font-family:var(--font-display);font-size:17px">${P.name}</b><span class="muted small">${P.maker} · from ${P.intro}</span></div>
    <div class="kv small" style="margin-top:6px">
      <span>Seats</span><span class="num">${seats}${biz ? ` (${biz} business)` : ''}</span>
      <span>Range · speed</span><span class="num">${nf(P.range)} km · ${nf(P.speed)} km/h</span>
      <span>Flying cost</span><span class="num">$${nf(P.hourly * 1000)}/hour · $${(P.hourly / P.seats * 1000).toFixed(0)}/seat-hour</span>
      <span>Comfort</span><span class="num">${stars(P.comfort)}</span>
      <span>Owning one</span><span class="num">${money(P.price * G.OWN_RATE)}/q · lease ${money(G.leaseCost(S, 0, t))}/q</span>
      <span>On this route</span><span class="num">${G.rtHours(t, d).toFixed(1)} h round trip · up to ${G.maxFreq(t, 1, d)}/wk each</span>
      <span>Your fleet</span><span class="num">${n} · ${avail(t)} free · avg ${G.avgAge(S, A, t).toFixed(0)} yrs · delay risk ${Math.round(R.risk * 100)}%</span>
      ${best ? `<span><b>Best schedule with it</b></span><span class="num"><b>${best.freq}/wk on ${best.planes}</b> · <b class="${best.v >= 0 ? 'good' : 'bad'}">${signed(best.v)}</b>/q</span>` : ''}
    </div>`;
}
function fareText() {
  const ed = ui.ed, fare = G.baseFare(S, G.dist(ed.a, ed.b));
  return `$${nf(fare * (1 + ed.fare / 100))} <span class="muted">(${pct(ed.fare)})</span>`;
}
function forecastHtml() {
  const ed = ui.ed;
  const pv = G.previewRoute(S, 0, { a: ed.a, b: ed.b, type: ed.type, planes: ed.planes, freq: ed.freq, fare: ed.fare, svc: ed.svc, cab: ed.cab, peak: ed.peak }, ed.id);
  const err = G.validateSpec(S, 0, ed, ed.id);
  const lfPct = Math.round(pv.lf * 100), seats = G.seatsOn(ed) * ed.freq;
  const localW = pv.paxWeek ? pv.localWeek / seats * 100 : 0;
  const connW = pv.paxWeek ? pv.connWeek / seats * 100 : 0;
  const total = pv.net + pv.knock;
  const loaded = ui.advice && ui.advice.loaded && ui.advice.id === ed.id;
  const rivals = S.routes.filter(r => r.o !== 0 && G.pairKey(r.a, r.b) === G.pairKey(ed.a, ed.b));
  return `<div class="stack" style="gap:14px">
    <div class="forecast">
      <div class="row" style="margin-bottom:8px"><span class="lbl grow">Quarterly forecast</span><span class="muted small">${rivals.length ? rivals.map(r => `<span class="dot" style="background:${S.airlines[r.o].color}"></span> ${pct(r.fare)}`).join(' ') : 'No competition yet'}</span></div>
      <div class="kv">
        <span>Travellers / week each way</span><span class="num">${nf(pv.demand)}</span>
        <span>You carry / week each way</span><span class="num">${nf(pv.paxWeek)}</span>
        <span class="muted small">· flying just this route</span><span class="num muted small">${nf(pv.localWeek)}</span>
        <span class="muted small">· connecting via your hubs</span><span class="num muted small">${nf(pv.connWeek)}</span>
        <span>Load factor</span><span class="num ${lfPct < 60 ? 'bad' : lfPct > 85 ? 'good' : ''}">${lfPct}%</span>
        <span>Revenue</span><span class="num">${money(pv.rev)}</span>
        ${pv.prem >= 0.05 ? `<span class="muted small">· of which business cabin</span><span class="num muted small">${money(pv.prem)}</span>` : ''}
        ${pv.cargo >= 0.05 ? `<span class="muted small">· of which belly cargo</span><span class="num muted small">${money(pv.cargo)}</span>` : ''}
        <span>Flying costs</span><span class="num">−${money(pv.cost)}</span>
        <span>Aircraft & slots</span><span class="num">−${money(pv.own)}</span>
        <span class="tot">Net per quarter</span><span class="num tot ${pv.net >= 0 ? 'good' : 'bad'}">${signed(pv.net)}</span>
        <span class="small">Knock-on effect on your other routes</span><span class="num small ${pv.knock >= 0.05 ? 'good' : pv.knock <= -0.05 ? 'bad' : ''}">${signed(pv.knock)}</span>
        <span class="tot">${ed.id ? 'Company profit with these settings' : 'Total effect on company profit'}</span><span class="num tot ${total >= 0 ? 'good' : 'bad'}">${signed(total)}</span>
      </div>
      <div class="lf" style="margin-top:10px" title="Blue: connecting passengers"><i style="width:${Math.min(100, localW)}%;background:var(--amber)"></i><i style="width:${Math.min(100 - Math.min(100, localW), connW)}%;background:#4cc3e8"></i></div>
      ${pv.pax ? `<p class="note" style="margin-top:8px">${Math.round((pv.biz || 0) / pv.pax * 100)}% business travellers (they value frequency and premium service), the rest leisure (they chase low fares).</p>` : ''}
      ${pv.spill > 500 ? `<p class="note" style="margin-top:4px">Flights full: about ${nf(pv.spill)} passengers a quarter won't get a seat. ${G.fullFix(S, { ...ed, o: 0, id: ed.id ?? undefined })}</p>` : ''}
      ${pv.blocked > 500 ? `<p class="note" style="margin-top:4px">About ${nf(pv.blocked)} connecting passengers a quarter are lost because their other flight is full.</p>` : ''}
    </div>
    ${err ? `<p class="err">${esc(err)}</p>` : ''}
    ${loaded ? `<p class="note" style="color:var(--amber)">The advisor's changes are loaded but not saved. Check the forecast, then press Save changes.</p>` : ''}
    <div class="btnrow">
      ${ed.id ? `<button class="btn danger" data-act="closeroute">${ui.confirmClose ? 'Tap again to close' : 'Close route'}</button>` : ''}
      ${ed.id ? '' : plannedHas(ed.a, ed.b) ? '<span class="tag blue" style="align-self:center">On your planned list</span>' : `<button class="btn" data-act="addplan" data-a="${ed.a}" data-b="${ed.b}">Plan for later</button>`}
      <button class="btn primary" data-act="${ed.id ? 'saveroute' : 'openroute'}" ${err ? 'disabled' : ''}>${ed.id ? 'Save changes' : 'Open route'}</button>
    </div>${!ed.id && err ? '<p class="note">Missing slots or aircraft? Plan it for later: Routes › Planned tracks what it still needs and takes you to each step.</p>' : ''}</div>`;
}
function routeSheet() {
  const ed = ui.ed, d = G.dist(ed.a, ed.b), fare = G.baseFare(S, d);
  const origins = ed.id ? [] : G.originsFor(S, 0, ed.b);
  const owned = G.fleetTypes(ME()).map(t => PLANE[t]);
  const usable = owned.filter(p => p.range >= d && avail(p.id) > 0);
  let body;
  if (!ed.type) {
    const buyable = G.buyableTypes(S, 0).filter(p => p.range >= d);
    body = `<div class="card"><p>No idle aircraft of yours can fly ${nf(d)} km.</p><p class="muted small" style="margin-top:6px">${buyable.length ? `For sale now: ${buyable.slice(0, 4).map(t => t.name).join(', ')}. New aircraft arrive next quarter.` : 'No aircraft on sale to you has that range yet.'}</p>
      <div class="btnrow" style="margin-top:10px">${plannedHas(ed.a, ed.b) ? '<span class="tag blue">On your planned list</span>' : `<button class="btn" data-act="addplan" data-a="${ed.a}" data-b="${ed.b}">Plan for later</button>`}<button class="btn primary" data-act="tab" data-tab="fleet">Go to Fleet</button></div></div>`;
  } else {
    clampEditor();
    const L = limits();
    const why = L.max === L.byPlanes ? `${ed.planes} aircraft` : L.max === L.sa ? `slots at ${ed.a}` : `slots at ${ed.b}`;
    body = `
    <div class="field"><span class="lbl">Aircraft</span><div class="tiles">
      ${usable.map(p => `<button class="tile" data-act="type" data-t="${p.id}" aria-pressed="${ed.type === p.id}" title="${p.name}: ${p.seats} seats, ${nf(p.range)} km range, $${(p.hourly / p.seats * 1000).toFixed(0)} per seat-hour"><b>${p.name}</b><small>${p.seats} seats · ${nf(p.range)} km · ${avail(p.id)} free</small></button>`).join('')}
    </div><div class="card tileinfo" id="tileinfo">${planeInfo(ed.type)}</div><span class="note">Only your idle aircraft that can fly ${nf(d)} km are shown. Hover over or pick one to see its details.</span></div>
    <div class="row" style="flex-wrap:wrap;gap:14px">
      <div class="field"><span class="lbl">Aircraft on route</span><div class="stepper"><button data-act="pl-" ${ed.planes <= 1 ? 'disabled' : ''} aria-label="Fewer aircraft">−</button><output class="num">${ed.planes}</output><button data-act="pl+" ${ed.planes >= avail(ed.type) ? 'disabled' : ''} aria-label="More aircraft">+</button></div></div>
      <div class="field"><span class="lbl">Round trips / week</span><div class="stepper"><button data-act="fq-" ${ed.freq <= 1 ? 'disabled' : ''} aria-label="Fewer flights">−</button><output class="num">${ed.freq}</output><button data-act="fq+" ${ed.freq >= L.max ? 'disabled' : ''} aria-label="More flights">+</button></div></div>
    </div>
    <p class="note" style="margin-top:-6px">Max ${L.max}/wk, limited by ${why}. Aircraft allow ${L.byPlanes}; free slots ${ed.a} ${Math.max(0, L.sa)}, ${ed.b} ${Math.max(0, L.sb)}.</p>
    <div class="row" style="margin-top:-4px"><span class="note grow">${ed.sugg === 'origin' ? `Schedule re-planned for flights from ${ed.a}. Fare, service and cabin are unchanged.` : ed.sugg === 'type' ? `Schedule re-planned for the ${PLANE[ed.type].name}.` : ed.sugg ? 'Suggested schedule: the best forecast for the aircraft and slots you have.' : 'Your own schedule.'}</span><button class="chip" data-act="suggest">Suggest schedule</button></div>
    ${utilNote(ed, d)}
    <div class="field"><div class="row"><span class="lbl grow">Fare</span><span class="num" id="fareVal">${fareText()}</span></div>
      <input type="range" id="fare" min="-50" max="50" step="5" value="${ed.fare}" aria-label="Fare adjustment"></div>
    <div class="field"><span class="lbl">Service level</span><div class="seg">${G.SERVICE.map(v => `<button data-act="svc" data-v="${v.id}" aria-pressed="${ed.svc === v.id}">${v.name}</button>`).join('')}</div><span class="note">${G.SERVICE[ed.svc].blurb}</span></div>
    <div class="field"><span class="lbl">Cabin layout · ${G.seatsOn(ed)} seats${G.bizSeatsOn(ed) ? `, ${G.bizSeatsOn(ed)} business` : ''}</span><div class="seg">${G.CABINS.map(c => `<button data-act="cab" data-v="${c.id}" aria-pressed="${(ed.cab || 0) === c.id}">${c.name}</button>`).join('')}</div><span class="note">${G.CABINS[ed.cab || 0].blurb}</span></div>
    <div class="field"><div class="row"><span class="lbl grow">Peak-time departures</span><button class="chip ${ed.peak ? 'on' : ''}" data-act="peak" aria-pressed="${!!ed.peak}">${ed.peak ? '✓ Peak times' : 'Off-peak'}</button></div>
      <span class="note">Peak departures win business travellers (+25%) but need a peak slot for every flight at both ends. Peak slots held: ${ed.a} ${G.peakHeld(S, 0, ed.a) - G.peakUsed(S, 0, ed.a, ed.id)} free, ${ed.b} ${G.peakHeld(S, 0, ed.b) - G.peakUsed(S, 0, ed.b, ed.id)} free. Upgrade slots from a city's sheet.</span></div>
    <div id="fc">${forecastHtml()}</div>
    ${ed.id ? routeInsights(S.routes.find(r => r.id === ed.id)) : ''}`;
  }
  return `
  <div class="sh-head"><div class="t"><div class="code">${ed.a} <span style="color:var(--amber)">⇄</span> ${ed.b}</div>
    <div class="sub">${esc(CITY[ed.a].name)} – ${esc(CITY[ed.b].name)} · <span class="num">${nf(d)} km</span> · base fare <span class="num">$${nf(fare)}</span></div></div>
    <button class="x" data-act="close" aria-label="Close">×</button></div>
  ${origins.length > 1 ? `<div class="field"><span class="lbl">Fly from</span><div class="seg">${origins.map(o => `<button data-act="origin" data-o="${o}" aria-pressed="${ed.a === o}">${o}</button>`).join('')}</div></div>` : ''}
  ${body}`;
}

function routeCard(r) {
  const L = r.last, P = PLANE[r.type];
  const lf = L ? Math.round(L.lf * 100) : null;
  const rivals = S.routes.filter(x => x.o !== r.o && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b));
  const connPct = L && L.pax ? L.conn / (G.seatsOn(r) * r.freq * 26) * 100 : 0;
  const flags = [r.cab ? G.CABINS[r.cab].name.toLowerCase() : '', r.peak ? 'peak times' : '', r.cutFrom ? `crisis cut, back to ${r.cutFrom.freq}/wk in ${r.cutFrom.left}q` : ''].filter(Boolean);
  return `<button class="rt" data-act="editroute" data-id="${r.id}">
    <span class="pair">${r.a} ⇄ ${r.b} ${rivals.map(x => `<span class="dot" style="background:${S.airlines[x.o].color}" title="${esc(S.airlines[x.o].name)}"></span>`).join('')}</span>
    <span class="num ${L ? (L.profit >= 0 ? 'good' : 'bad') : 'muted'}" style="text-align:right">${L ? signed(L.profit) : 'New'}</span>
    <span class="meta"><b class="mini">Now</b> ${r.planes} × ${P.name} · ${r.freq}/wk · fare ${pct(r.fare)}${flags.length ? ' · ' + flags.join(' · ') : ''}${rivals.length ? ` · rivals ${rivals.map(x => pct(x.fare)).join(', ')}` : ''}</span>
    <span class="meta"><b class="mini">Last quarter</b> ${L ? `load ${lf}% · ${nf(L.pax)} boardings · ${Math.round(L.conn / Math.max(1, L.pax) * 100)}% connecting${L.disrupted ? ' · <span class="bad">delays</span>' : ''}` : 'no results yet · first results next quarter'}</span>
    ${L ? `<span class="lf"><i style="width:${Math.min(100, lf - connPct)}%;background:${lf < 60 ? 'var(--bad)' : 'var(--amber)'}"></i><i style="width:${Math.max(0, connPct)}%;background:#4cc3e8"></i></span>` : ''}
  </button>`;
}

// ---------- route history and the advisor ----------
function routeInsights(r) {
  if (!r) return '';
  const h = r.hist || [], labels = h.map(qShort);
  const view = ui.rstat || 'pax';
  let chart;
  if (view === 'pax') chart = lineChart([{ name: 'All passengers', color: '#f4b13e', values: h.map(x => x.pax), bold: 1 }, { name: 'Connecting', color: '#4cc3e8', values: h.map(x => x.conn) }, { name: 'Turned away', color: '#ef6f6c', values: h.map(x => x.spill), dash: 1 }], labels, { label: 'Passengers per quarter' });
  else if (view === 'lf') chart = lineChart([{ name: 'Load factor %', color: '#f4b13e', values: h.map(x => Math.round(x.lf * 100)), bold: 1 }], labels, { fmt: v => Math.round(v) + '%', label: 'Load factor' });
  else if (view === 'profit') chart = barChart(h.map(x => x.profit), labels, { fmt: v => '$' + chartFmt(v) + 'M', label: 'Route profit per quarter' });
  else chart = lineChart([{ name: 'Your fare', color: '#f4b13e', values: h.map(x => x.fare), bold: 1 }, { name: 'Cheapest rival', color: '#ef6f6c', values: h.map(x => x.rf) }], labels, { fmt: v => (v > 0 ? '+' : '') + Math.round(v) + '%', zero: false, label: 'Fares' });
  const L = r.last, sat = Math.round(G.routeSat(S, r));
  const adv = ui.advice && ui.advice.id === r.id ? ui.advice.res : null;
  return `<div class="card stack">
    <div class="row"><span class="lbl grow">Route history</span><span class="note">${h.length} quarter${h.length === 1 ? '' : 's'}</span></div>
    <div class="subtabs">${[['pax', 'Passengers'], ['lf', 'Load'], ['profit', 'Profit'], ['fare', 'Fares']].map(([k, n]) => `<button data-act="rstat" data-v="${k}" aria-pressed="${view === k}">${n}</button>`).join('')}</div>
    ${chart}
    <div class="stats">
      <div class="stat"><small>Satisfaction</small><b>${sat}</b><div class="meter"><i style="width:${sat}%;background:${sat >= 60 ? 'var(--good)' : sat >= 40 ? 'var(--amber)' : 'var(--bad)'}"></i></div></div>
      <div class="stat"><small>Aircraft age</small><b>${G.avgAge(S, ME(), r.type).toFixed(0)} yrs</b></div>
      <div class="stat"><small>Flying since</small><b>${r.age}q</b></div>
    </div>
    ${L ? `<p class="note">Last quarter: ${nf(L.pax)} boardings (${nf(L.local)} flying just this route, ${nf(L.conn)} on part of a connecting journey${L.inter ? `, ${nf(L.inter)} via a codeshare partner` : ''}${L.biz != null ? `; ${Math.round(L.biz / Math.max(1, L.pax) * 100)}% business` : ''}). Revenue ${money(L.rev)}${L.cargo >= 0.05 ? ` incl. cargo ${money(L.cargo)}` : ''}, flying costs ${money(L.cost)}.</p>` : ''}
    ${satHtml(r, sat)}
  </div>
  ${L ? lossHtml(r, L) : ''}
  ${impactHtml(r)}
  <div class="advice stack">
    <div class="person">${faceSvg(ADVISOR_FACE.ops, '#8d9cb6', 40)}<div class="quote grow"><div class="who">${G.ADVISORS.ops.name} · route review</div>
      ${adv ? `<ul class="news" style="margin:4px 0 8px">${adv.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
        ${adv.loaded ? '<p>Loaded into the planner above. Nothing changes until you press <b>Save changes</b>.</p>' : adv.changes.length && adv.gain > 0.05 ? `<p><b>My advice:</b> ${esc(adv.changes.join(', '))}. That should add about <b class="good">${money(adv.gain)}</b> a quarter across your network.${adv.best.svc < adv.cur.svc ? ' Passenger satisfaction will dip a little.' : ''}</p>` : '<p>I tested other fares, frequencies, aircraft and service levels. What you have now is already the best of them.</p>'}`
        : 'Want me to look at this route? I\'ll test other fares, frequencies, aircraft and service levels against the whole network.'}
    </div></div>
    ${adv ? (adv.changes.length && adv.gain > 0.05 && !adv.loaded ? '<button class="btn primary" data-act="applyadvice">Load into planner</button>' : '') : '<button class="btn" data-act="advise">Ask for advice</button>'}
  </div>`;
}

// What the satisfaction score is made of, and what it does to bookings.
function satHtml(r, sat) {
  const parts = G.satParts(S, r).filter(([, v], k) => k === 0 || Math.abs(v) >= 0.5);
  const A = ME(), appeal = Math.round((G.satAppeal(A) - 1) * 100);
  const worst = parts.slice(1).filter(p => p[1] < 0).sort((x, y) => x[1] - y[1])[0];
  return `<details><summary>Why satisfaction is ${sat}${worst ? ` · biggest drag: ${esc(worst[0].toLowerCase())}` : ''}</summary>
    <div class="kv" style="margin-top:6px">${parts.map(([l, v], k) => `<span class="small">${esc(l)}</span><span class="num small ${k && v > 0 ? 'good' : v < 0 ? 'bad' : ''}">${k ? (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)) : Math.round(v)}</span>`).join('')}</div>
    <p class="note" style="margin-top:6px">Your airline-wide score (${Math.round(A.sat ?? 50)}) is the average over all routes, weighted by passengers. It makes travellers ${appeal >= 0 ? appeal + '% more' : -appeal + '% less'} likely to choose you on every route. Each 10 points is worth about 6% of bookings.</p></details>`;
}

// How many aircraft hours the route uses, so idle capacity is visible.
function utilNote(ed, d) {
  const used = ed.freq * G.rtHours(ed.type, d), have = ed.planes * G.HOURS_PER_PLANE, u = Math.round(used / have * 100);
  const spare = Math.floor((have - used) / G.rtHours(ed.type, d));
  return `<p class="note">Aircraft use: <b class="${u < 60 ? 'bad' : u > 85 ? 'good' : ''}">${u}%</b> of their flying week${spare > 0 ? ` · room for ${spare} more round trip${spare > 1 ? 's' : ''}` : ''}${u < 60 && ed.planes > 1 ? ' · one fewer aircraft may do' : ''}.</p>`;
}
// Where the market for this city pair went last quarter.
function lossHtml(r, L) {
  const m = L.mkt;
  const row = (label, v, cls) => `<span>${label}</span><span class="num ${cls || ''}">${v}</span>`;
  const neg = v => (Math.round(v) > 0 ? '−' + nf(v) : Math.round(v) < 0 ? '+' + nf(-v) : '0');
  return `<div class="card stack"><span class="lbl">Where the passengers went · last quarter</span>
    <div class="kv">
      ${m ? `${row(`People who might fly ${r.a}–${r.b}`, nf(m.D))}
      ${row(m.price >= 0 ? 'Put off by fares on this route' : 'Drawn in by low fares', neg(m.price), m.price > 0 ? 'bad' : 'good')}
      ${row('Put off by too few flights', neg(m.freq), m.freq > 0 ? 'bad' : '')}
      ${row('Chose a rival', neg(m.rivals), m.rivals > 0 ? 'bad' : '')}
      ${row('<b>Chose your nonstop</b>', `<b>${nf(m.mine)}</b>`)}` : ''}
      ${row('Plus connecting via your hubs', '+' + nf(m ? Math.max(0, L.pax + L.spill + L.blocked - m.mine) : L.conn))}
      ${row('Turned away: this flight full', neg(L.spill), L.spill > 0 ? 'bad' : '')}
      ${row('Lost: their other flight full', neg(L.blocked), L.blocked > 0 ? 'bad' : '')}
      ${row('<b>Carried</b>', `<b>${nf(L.pax)}</b>`)}
    </div>
    <p class="note">${L.spill > L.pax * 0.05 ? 'This route is short of seats.' : L.blocked > L.pax * 0.05 ? 'Add seats on the connecting routes to win these back.' : m && m.rivals > m.mine ? 'Rivals take most of this market: frequency, fares and service decide who wins.' : m && m.price > m.D * 0.3 ? 'High fares are shrinking the market here.' : 'Seats and demand are well matched.'}</p></div>`;
}

// ---------- airport finder ----------
function openFinder() {
  ui.sheet = 'find'; ui.sel = null; ui.ed = null;
  ui.findQ = ui.findQ || ''; ui.findR = ui.findR || 'all';
  if (ui.tab !== 'map') { ui.tab = 'map'; renderAll(); }
  renderSheet();
  const inp = $('#findq'); if (inp && W >= 700) inp.focus();
}
function finderList() {
  const q = (ui.findQ || '').trim().toLowerCase(), A = ME();
  let list = CITIES.filter(c => ui.findR === 'all' || c.region === ui.findR);
  if (q) list = list.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.cc.toLowerCase() === q);
  const served = new Set(G.routesOf(S, 0).flatMap(r => [r.a, r.b]));
  list.sort((x, y) => (y.code === A.home) - (x.code === A.home) || (A.hubs.includes(y.code) - A.hubs.includes(x.code)) || (served.has(y.code) - served.has(x.code)) || G.cityStats(S, y.code).pop - G.cityStats(S, x.code).pop);
  if (!list.length) return '<p class="muted">No airport matches.</p>';
  return list.slice(0, 60).map(c => {
    const closed = G.cityClosed(S, 0, c.code) || (G.coldWar(S) && G.blocClash(A.bloc, c.bloc));
    const tags = [A.hubs.includes(c.code) ? '<span class="tag">Your hub</span>' : '', served.has(c.code) ? '<span class="tag blue">You fly</span>' : '',
      (A.slots[c.code] || 0) > 0 ? `<span class="tag grey">${G.slotsAvail(S, 0, c.code)} free slots</span>` : '', closed ? '<span class="tag grey">Closed to you</span>' : ''].join('');
    const st = G.cityStats(S, c.code);
    return `<button class="rt" data-act="city" data-c="${c.code}"><span class="pair">${c.code} <span class="muted small" style="font-family:var(--font-body)">${esc(c.name)}</span></span>
      <span class="num muted small" style="text-align:right">${REGION[c.region].name}</span>
      <span class="meta">${st.pop.toFixed(1)}M people · economy ${Math.round(st.econ)}/10 · tourism ${c.tour}/10${c.major ? ' · major city' : ''} ${tags}</span></button>`;
  }).join('') + (list.length > 60 ? `<p class="note">${list.length - 60} more · refine the search.</p>` : '');
}
function finderSheet() {
  return `<div class="sh-head"><div class="t"><div class="code">Airports</div><div class="sub">${CITIES.length} cities · search by name or code</div></div>
    <button class="x" data-act="close" aria-label="Close">×</button></div>
    <div class="field"><input type="search" id="findq" placeholder="City, code or country code" value="${esc(ui.findQ || '')}" autocomplete="off" aria-label="Search airports"></div>
    <div class="chips" style="margin-bottom:10px"><button class="chip ${ui.findR === 'all' ? 'on' : ''}" data-act="findr" data-r="all">All</button>${REGIONS.map(R => `<button class="chip ${ui.findR === R.id ? 'on' : ''}" data-act="findr" data-r="${R.id}">${R.name}</button>`).join('')}</div>
    <div id="findlist">${finderList()}</div>`;
}

// ---------- planned routes and competition impact (shared with panels and reports) ----------
const plannedHas = (a, b) => (ME().planned || []).some(p => G.pairKey(p.a, p.b) === G.pairKey(a, b));
// What moved on a route between its last two quarters: the market as a whole, and what rivals took.
function impactHtml(r, compact) {
  const m = G.routeImpact(r);
  if (!m) return '';
  const competed = m.rivalsNow || m.rivalsBefore;
  if (!competed && compact) return '';
  const pc = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + '%';
  const sh = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const why = [];
  if (m.rivalsNow > m.rivalsBefore) why.push(`${m.rivalsNow - m.rivalsBefore} new rival${m.rivalsNow - m.rivalsBefore > 1 ? 's' : ''} on the route`);
  if (m.rivalsNow < m.rivalsBefore) why.push('a rival left');
  if (m.rfNow != null && m.rfBefore != null && m.rfNow !== m.rfBefore) why.push(`cheapest rival fare ${pct(m.rfBefore)} → ${pct(m.rfNow)}`);
  if (m.before.fare !== m.now.fare) why.push(`your fare ${pct(m.before.fare)} → ${pct(m.now.fare)}`);
  const rows = `<span>Passengers</span><span class="num ${m.dPax >= 0 ? 'good' : 'bad'}">${nf(m.before.pax)} → ${nf(m.now.pax)}</span>
    ${m.dRev != null ? `<span>Revenue</span><span class="num ${m.dRev >= 0 ? 'good' : 'bad'}">${signed(m.dRev)}</span>` : ''}
    <span>Route profit</span><span class="num ${m.dProfit >= 0 ? 'good' : 'bad'}">${signed(m.dProfit)}</span>
    ${m.market != null ? `<span class="muted small">Whole market (season, events, economy)</span><span class="num small">${pc(m.market)}</span>` : ''}
    ${m.dRivals != null && competed ? `<span class="muted small">Travellers on rival flights</span><span class="num small ${m.dRivals > 0 ? 'bad' : 'good'}">${m.dRivals >= 0 ? '+' : '−'}${nf(Math.abs(m.dRivals))}</span>` : ''}
    ${competed ? `<span class="muted small">Your share of nonstop travellers</span><span class="num small">${sh(m.shareBefore)} → ${sh(m.shareNow)}</span>` : ''}`;
  const verdict = m.market != null && m.dRivals != null && competed
    ? (Math.abs(m.dRivals) > Math.abs(m.market * (m.before.D || 0)) ? 'Most of the change came from competition.' : 'Most of the change came from the market as a whole, not rivals.') : '';
  const text = [why.length ? (compact ? '' : 'What changed: ') + why.join(', ') : '', verdict].filter(Boolean).join('. ');
  if (compact) return `<div class="kv small" style="margin-top:6px">${rows}</div>${text ? `<p class="note">${esc(text)}</p>` : ''}`;
  return `<div class="card stack"><span class="lbl">Last quarter vs the one before</span><div class="kv">${rows}</div>${text ? `<p class="note">${esc(text)}</p>` : ''}</div>`;
}
