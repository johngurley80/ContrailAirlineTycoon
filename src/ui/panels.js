// ---------- full-screen tabs: routes, fleet, rivals, company ----------
function subtabs(key, items) {
  return `<div class="subtabs" role="tablist">${items.map(([k, n]) => `<button data-act="sub" data-k="${key}" data-v="${k}" aria-pressed="${ui[key] === k}">${n}</button>`).join('')}</div>`;
}

// ---------- routes: list, slots ledger, opportunities ----------
function routesPanel() {
  ui.rview = ui.rview || 'list';
  const np = (ME().planned || []).length;
  const head = `<h2>Network</h2>${subtabs('rview', [['list', 'Routes'], ['plan', `Planned${np ? ` · ${np}` : ''}`], ['slots', 'Slots'], ['opps', 'Opportunities']])}`;
  if (ui.rview === 'plan') return head + plannedView();
  if (ui.rview === 'slots') return head + slotsView();
  if (ui.rview === 'opps') return head + oppsView();
  ui.rsort = ui.rsort || 'profit';
  const nRivals = r => S.routes.filter(x => x.o !== 0 && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b)).length;
  const sortKey = {
    profit: r => (r.last ? r.last.profit : -1e9), margin: r => (r.last && r.last.rev ? r.last.profit / r.last.rev : -1e9),
    lf: r => (r.last ? r.last.lf : -1), sat: r => -G.routeSat(S, r), comp: r => nRivals(r) * 1000 - r.fare,
  }[ui.rsort];
  const rs = G.routesOf(S, 0).slice().sort((x, y) => sortKey(y) - sortKey(x));
  const tot = rs.reduce((t, r) => t + (r.last ? r.last.profit : 0), 0);
  const f = ME().lastFin;
  const boards = rs.reduce((t, r) => t + (r.last ? r.last.pax : 0), 0), connBoards = rs.reduce((t, r) => t + (r.last ? r.last.conn : 0), 0);
  const exposed = G.exposedRoutes(S).filter(x => x.lure > 0.25);
  if (!rs.length) return head + `<div class="card"><p>No routes yet.</p><p class="muted" style="margin-top:6px">Open the map and tap a city where you hold slots. Your starter slots are at ${ME().starters.join(', ')}.</p><div class="btnrow" style="margin-top:12px"><button class="btn primary" data-act="tab" data-tab="map">Open the map</button></div></div>`;
  const attacked = rs.filter(r => S.routes.some(x => x.o !== 0 && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b) && x.fare < r.fare));
  const hist = ME().history.slice(-8);
  ui.rtview = ui.rtview || 'cards';
  const viewChips = `<div class="seg" style="margin:6px 0 10px">${[['cards', 'Cards'], ['table', 'Quick edit table']].map(([k, n]) => `<button data-act="rtview" data-v="${k}" aria-pressed="${ui.rtview === k}">${n}</button>`).join('')}</div>`;
  if (ui.rtview === 'table') return head + viewChips + routeTable(rs);
  return head + viewChips + decisionsHtml(true) + `<p class="muted">${rs.length} route${rs.length > 1 ? 's' : ''} · route profit last quarter <span class="num ${tot >= 0 ? 'good' : 'bad'}">${signed(tot)}</span> before aircraft, slot and office costs.</p>
  ${f && f.pax ? `<p class="note">Last quarter you carried <b>${nf(f.pax)}</b> passenger journeys, <b>${nf(f.conn || 0)}</b> of them connecting through a hub. Route figures count boardings instead (${nf(boards)}): a connecting journey boards two flights, so it appears on both routes.</p>` : ''}
  ${exposed.length ? `<div class="card" style="border-color:var(--amber)"><span class="lbl" style="color:var(--amber)">Fat margins attract challengers</span><p class="small" style="margin-top:4px">${exposed.slice(0, 3).map(x => `${x.r.a}–${x.r.b} (${Math.round(x.m * 100)}% margin, fare ${pct(x.r.fare)})`).join(', ')} ${exposed.length > 1 ? 'have' : 'has'} no competition. Rivals can win traffic rights to any route this profitable, hub or no hub. Adding seats or easing the fare makes it less tempting.</p></div>` : ''}
  <div class="chips">${[['profit', 'Route profit'], ['margin', 'Margin'], ['lf', 'Load'], ['sat', 'Lowest satisfaction'], ['comp', 'Most competition']].map(([k, n]) => `<button class="chip ${ui.rsort === k ? 'on' : ''}" data-act="rsort" data-v="${k}">${n}</button>`).join('')}</div>
  ${hist.length > 1 ? `<div class="card">${lineChart([{ name: 'Passengers', color: '#f4b13e', values: hist.map(h => h.pax), bold: 1 }], hist.map(qShort), { h: 110, label: 'Your passengers per quarter' })}</div>` : ''}
  <p class="note"><span class="dot" style="background:var(--amber)"></span> local passengers <span class="dot" style="background:#4cc3e8;margin-left:8px"></span> connecting · coloured dots are rivals on the same route. Tap a route for its history and advice.</p>
  ${attacked.length ? `<div class="card" style="border-color:#6b2f33"><span class="lbl" style="color:var(--bad)">Undercut</span><p class="small" style="margin-top:4px">A rival is cheaper than you on ${attacked.map(r => `${r.a}–${r.b}`).join(', ')}.</p></div>` : ''}
  ${rs.map(routeCard).join('')}`;
}

function slotsView() {
  const A = ME();
  const codes = [...new Set([...A.hubs, ...Object.keys(A.slots)])].filter(c => G.slotsHeld(S, 0, c) > 0);
  const rows = codes.map(c => ({ c, held: G.slotsHeld(S, 0, c), used: G.slotsUsed(S, 0, c), fee: G.slotsHeld(S, 0, c) * G.slotFee(S, c), rel: Math.round(G.rel(S, 0, c)) }))
    .sort((x, y) => (y.held - y.used) - (x.held - x.used));
  const held = rows.reduce((t, r) => t + r.held, 0), used = rows.reduce((t, r) => t + r.used, 0), fees = rows.reduce((t, r) => t + r.fee, 0);
  const idleFee = rows.reduce((t, r) => t + (r.held - r.used) * G.slotFee(S, r.c), 0);
  const pend = A.pending.filter(p => p.kind === 'slots');
  return `<div class="stats">
      <div class="stat"><small>Held</small><b>${held}</b></div><div class="stat"><small>In use</small><b>${used}</b></div><div class="stat"><small>Fees / qtr</small><b>${money(fees)}</b></div></div>
    <p class="muted small">Weekly slots at every airport where you hold them. Unused slots cost ${money(idleFee)} a quarter in fees. Returning them refunds half their current price. Tap a row to open the city.</p>
    ${pend.length ? `<p class="note">Negotiating now: ${pend.map(p => `${p.n} at ${p.city}`).join(', ')}.</p>` : ''}
    <div class="card scroll-x"><table class="tbl">
      <thead><tr><th>City</th><th class="n">Held</th><th class="n">Used</th><th class="n">Free</th><th>Airport</th><th class="n">Rel.</th><th></th></tr></thead>
      <tbody>${rows.map(r => {
        const free = r.held - r.used, cap = S.cap[r.c];
        const shares = S.airlines.map(B => (B.slots[r.c] || 0) / cap * 100);
        return `<tr><td data-act="city" data-c="${r.c}" style="cursor:pointer"><b>${r.c}</b>${A.hubs.includes(r.c) ? ' <span style="color:var(--amber)">◆</span>' : ''}<div class="note">${esc(CITY[r.c].name)}</div></td>
          <td class="n">${r.held}</td><td class="n">${r.used}</td><td class="n ${free > 0 ? '' : 'muted'}" style="${free > 5 ? 'color:var(--amber)' : ''}">${free}</td>
          <td style="min-width:70px"><div class="lf" style="height:6px" title="Slot share by airline">${shares.map((v, k) => `<i style="width:${v}%;background:${S.airlines[k].color}"></i>`).join('')}</div><div class="note">${Math.max(0, G.airportFree(S, r.c))}/${cap} free</div></td>
          <td class="n">${r.rel}</td>
          <td>${free > 0 && !(A.hubs.includes(r.c) && r.held - free < 10) ? `<button class="chip" data-act="retslots" data-c="${r.c}" data-n="${free}">Return ${free}</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
}

function oppsView() {
  const ops = G.opportunities(S, 0, 15);
  const missing = REGIONS.filter(R => !ME().hubs.some(h => CITY[h].region === R.id)), ctx = G.objectiveContext(S);
  const objCard = ctx.hubsMatter
    ? `<div class="card"><span class="lbl">Objective · ${esc(ctx.name)}</span><p class="small" style="margin-top:4px">You have hubs in ${ctx.hubRegions} of the ${ctx.hubsNeed} regions your objective needs. No hub yet in ${missing.map(R => R.name).join(', ')}: fly to a major city there first, then build. Routes into these regions are ranked higher below.</p></div>`
    : `<div class="card"><span class="lbl">Objective · ${esc(ctx.name)}</span><p class="small" style="margin-top:4px">Success is measured by ${ctx.measures.join('; ')}.${ctx.obj === 'regional' ? ' Routes in your home region are ranked higher below.' : ' Hubs in new regions are optional: open one only if its routes pay.'}${S.scenario || ctx.cashCounts ? ` ${ctx.left} quarter${ctx.left === 1 ? '' : 's'} left, so favour markets that pay back before the end of ${S.end - 1}.` : ''}</p></div>`;
  return `${objCard}
  <p class="muted small">The biggest markets you could fly from your hubs, after allowing for rivals' seats and passengers your network would feed in. Revenue is a rough quarterly estimate at standard fares.</p>
    <button class="btn" data-act="heat">${ui.heat ? 'Hide them on the map' : 'Show them on the map'}</button>
    ${ops.length ? ops.map(o => `<div class="card stack">
      <div class="row"><div class="grow"><b style="font-family:var(--font-display);font-size:20px;letter-spacing:.03em">${o.a} ⇄ ${o.b}</b>
        ${o.newRegion ? `<span class="tag ${o.boost > 1 ? 'blue' : ''}">New region · ${REGION[CITY[o.b].region].name}</span>` : ''}
        <div class="muted small">${esc(CITY[o.b].name)} · ${nf(o.d)} km${o.rivals ? ` · ${o.rivals} rival${o.rivals > 1 ? 's' : ''}` : ' · nobody flies it'}</div></div>
        <div style="text-align:right"><b class="num good">~${money(o.value, 0)}</b><div class="note">a quarter</div></div></div>
      <div class="note">${nf(o.unmet)} travellers a week unserved${o.feed ? `, including ~${nf(o.feed)} connecting from your network` : ''}. ${o.inRange ? '' : 'None of your aircraft has the range yet. '}${o.slots >= 2 ? `${o.slots} free slots at both ends.` : `You need slots at ${G.slotsAvail(S, 0, o.a) < 2 ? o.a : o.b}.`}</div>
      <div class="btnrow">${o.slots >= 2 && o.inRange ? `<button class="btn primary" data-act="planpair" data-a="${o.a}" data-b="${o.b}">Plan route</button>` : ''}${plannedHas(o.a, o.b) ? '<span class="tag blue" style="align-self:center">Planned</span>' : `<button class="btn" data-act="addplan" data-a="${o.a}" data-b="${o.b}">Plan for later</button>`}<button class="btn" data-act="city" data-c="${G.slotsAvail(S, 0, o.a) < 2 ? o.a : o.b}">Open ${G.slotsAvail(S, 0, o.a) < 2 ? o.a : o.b}</button></div>
    </div>`).join('') : '<p class="muted">No big untapped markets within reach. Build hubs in new regions to find more.</p>'}`;
}

// ---------- fleet: your aircraft, the market with filters, compare, lease ----------
const stars = c => { const n = G.clamp(Math.round((c - 0.7) * 10), 1, 5); return '★'.repeat(n) + '☆'.repeat(5 - n); };
// A what-if for an aircraft you have not bought: its economics on your routes and best untapped markets.
function tryPlaneHtml(t) {
  const T = G.tryPlane(S, 0, t), P = PLANE[t], A = ME();
  const rows = T.results.map(r => `<tr><td><b>${r.a}–${r.b}</b><div class="note">${r.r ? `replaces your ${PLANE[r.r.type].name}` : 'new route'} · ${esc(r.config)}</div></td>
    <td class="n">${r.freq}/wk<div class="note">${r.planes} aircraft${r.buy ? `, buy ${r.buy}` : ''} · ${Math.round(r.lf * 100)}% full</div></td>
    <td class="n"><b class="${r.change >= 0 ? 'good' : 'bad'}">${signed(r.change)}</b>/q<div class="note">${r.cash ? `${money(r.cash, 0)} to buy` : 'no purchase'}</div></td></tr>`).join('');
  const best = T.results[0];
  return `<div class="row"><p class="hero-title grow" style="font-size:26px;margin:0">Try the ${esc(P.name)}</p><button class="x" data-act="closemodal" aria-label="Close">×</button></div>
    <p class="small">A forecast as if you bought the aircraft each schedule needs, using the same network forecast as the route planner. Nothing is bought.</p>
    <div class="card"><div class="kv small">
      <span>Price</span><span class="num">${money(T.price, 1)}</span>
      <span>Worth on delivery</span><span class="num">${money(T.value0, 1)} <span class="bad">(${signed(T.value0 - T.price)})</span></span>
      <span>Worth in a year</span><span class="num">${money(T.value1, 1)}</span>
      <span>Owning one</span><span class="num">${money(T.own)}/q · or lease ${money(T.lease)}/q</span>
      <span>Fleet-mix cost</span><span class="num">${T.mixDelta > 0.005 ? `${money(T.mixDelta)}/q` : 'none'}</span>
      ${T.idle ? `<span>Already idle in your fleet</span><span class="num">${T.idle}</span>` : ''}
    </div><p class="note">Selling a new aircraft returns its value, not its price: trying one for real costs about ${money(T.price - T.value0, 0)} each.</p></div>
    ${rows ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Route</th><th class="n">Schedule</th><th class="n">Company profit</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Change in company profit a quarter: route results, the effect on your other routes, slot fees, ownership of the aircraft bought and the fleet-mix cost. On a route you already fly it replaces the aircraft there (they become idle). Standard and premium cabins are both tried; the better one is shown.</p>
      <p class="small">${best.change > 0 ? `<b class="good">Worth it on ${best.a}–${best.b}.</b>` : `<b class="bad">It loses money on every route tried.</b> Wait for new markets or a fare rise before buying.`}</p>`
      : '<p class="muted">None of your routes or nearby markets is in its range.</p>'}
    <div class="btnrow"><button class="btn primary" data-act="buy" data-one="1" data-t="${t}" ${A.cash >= T.price ? '' : 'disabled'}>Buy one · ${money(T.price, 0)}</button><button class="btn" data-act="closemodal">Close</button></div>`;
}

function fleetPanel() {
  const A = ME();
  const onOrder = {}; A.orders.forEach(o => (onOrder[o.type] = (onOrder[o.type] || 0) + o.n));
  const owned = G.fleetTypes(A);
  const mine = owned.map(t => {
    const P = PLANE[t], n = G.fleetCount(A, t), idle = G.idle(S, 0, t), age = G.avgAge(S, A, t), leased = G.leasedCount(A, t);
    const oldest = A.fleet.filter(f => f.type === t && !f.lease).sort((x, y) => x.built - y.built)[0];
    const sellable = Math.min(idle, n - leased), returnable = Math.min(idle, leased), reserve = G.reserveOf(S, 0, t), RT = returnable ? G.returnTerms(S, 0, t) : null;
    const hrs = G.routesOf(S, 0).filter(r => r.type === t).reduce((h, r) => h + r.freq * G.rtHours(t, G.dist(r.a, r.b)), 0);
    const util = n > idle ? Math.round(hrs / ((n - idle) * G.HOURS_PER_PLANE) * 100) : 0;
    const R = G.reliability(S, 0, t), since = G.sinceCheck(A, t), convErr = G.canConvert(S, 0, t);
    const chk = R.over ? `<b class="bad">heavy check ${R.over} quarter${R.over > 1 ? 's' : ''} overdue</b>` : R.due <= 1 ? `<b style="color:var(--amber)">heavy check due ${R.due <= 0 ? 'now' : 'next quarter'}</b>` : `next heavy check in ${R.due} quarters`;
    return `<div class="card plane">
      <div><span class="pname">${P.name}</span>${S.year > P.sold ? '<span class="tag grey">Out of production</span>' : ''}${leased ? `<span class="tag blue">${leased} leased</span>` : ''}
        <div class="spec num">${P.seats} seats · ${nf(P.range)} km · ${nf(P.speed)} km/h</div></div>
      <div style="text-align:right" class="num">${n} in fleet<div class="spec">${idle > 0 ? (reserve && idle === 1 ? '<span class="good">1 spare (reserve)</span>' : `<span style="color:var(--amber)">${idle} idle${reserve ? ', 1 kept as reserve' : ''}</span>`) : 'all flying'} · avg ${age.toFixed(0)} yrs</div></div>
      <div style="grid-column:1/-1"><div class="lf" style="height:6px" title="Share of flying hours used"><i style="width:${Math.min(100, util)}%;background:${util < 60 ? 'var(--bad)' : 'var(--amber)'}"></i></div>
        <div class="note">${n > idle ? `Aircraft in service fly ${util}% of their available hours${util < 60 ? ` · ${removableText(t)}` : ''}` : 'None in service'}${idle ? ` · ${idle} idle` : ''}</div></div>
      ${sellable || returnable ? `<div class="btnrow" style="grid-column:1/-1">${sellable ? `<button class="btn" data-act="sell" data-t="${t}">Sell oldest · ${money(G.planeValue(S, t, S.year - oldest.built), 1)}</button>` : ''}${returnable ? `<button class="btn" data-act="retlease" data-t="${t}">Return 1 lease · ${RT.left > 0 ? `${RT.left}q left, fee ${money(RT.fee)}` : 'term done'}${RT.refund ? `, deposit back ${money(RT.refund)}` : ''}</button>` : ''}</div>` : ''}
      ${age > 18 ? `<p class="note" style="grid-column:1/-1">Upkeep is up ${Math.round((G.maintMult(S, A, t) - 1) * 100)}% with age.</p>` : ''}
      <p class="note" style="grid-column:1/-1">Maintenance: ${chk} · delay risk ${Math.round(R.risk * 100)}% per route a quarter${R.spare ? ' (a spare aircraft absorbs most delays)' : R.util > 0.85 ? ' · no spare aircraft' : ''}.</p>
      <div class="btnrow" style="grid-column:1/-1">${since >= G.CHECK_EVERY - 2 ? `<button class="btn ${R.over ? 'primary' : ''}" data-act="check" data-t="${t}" ${A.cash >= G.checkCost(S, 0, t) ? '' : 'disabled'}>Heavy check · ${money(G.checkCost(S, 0, t))}</button>` : ''}
        ${!convErr ? `<button class="btn" data-act="convert" data-t="${t}" ${A.cash >= G.convertCost(S, t) ? '' : 'disabled'}>Convert one to a freighter · ${money(G.convertCost(S, t))}</button>` : ''}</div>
    </div>`;
  }).join('');
  const cm = G.commonality(S, 0), fr = A.freighters || [];
  const mix = owned.length ? `<div class="card"><span class="lbl">Fleet mix</span><p class="small" style="margin-top:4px">${cm.types} type${cm.types > 1 ? 's' : ''} from ${cm.makers} maker${cm.makers > 1 ? 's' : ''}. ${cm.cost >= 0.05 ? `Extra makers and types cost <b class="bad">${money(cm.cost)}</b> a quarter in pilot training, spares and engineers.` : 'One family keeps training and spares cheap.'}</p>
    <p class="note">Each extra manufacturer adds about ${money(1.4 * Math.max(0.3, G.eraScale(S)))} a quarter; each extra type from the same maker about ${money(0.5 * Math.max(0.3, G.eraScale(S)))}.</p></div>` : '';
  const frHtml = fr.length ? `<div class="card"><span class="lbl">Cargo freighters · ${fr.length}</span><div class="kv" style="margin-top:6px">${fr.map(x => `<span>${PLANE[x.type].name} <span class="muted">· built ${x.built}</span></span><span class="num ${G.freighterIncome(S, 0, x) >= 0 ? 'good' : 'bad'}">${signed(G.freighterIncome(S, 0, x))}/q</span>`).join('')}</div><p class="note">Freighters fly for your cargo arm and need no slots. Belly cargo on passenger flights earns ${money(G.routesOf(S, 0).reduce((t, r) => t + G.bellyCargo(S, r), 0))} a quarter on top.</p></div>` : '';

  const f = ui.ff = ui.ff || { range: 'all', maker: 'all', afford: false, sort: 'range', route: '' };
  let list = G.buyableTypes(S, 0);
  const makers = [...new Set(list.map(p => p.maker))].sort();
  if (f.range === 'short') list = list.filter(p => p.range < 3500);
  if (f.range === 'medium') list = list.filter(p => p.range >= 3500 && p.range < 8000);
  if (f.range === 'long') list = list.filter(p => p.range >= 8000);
  if (f.maker !== 'all') list = list.filter(p => p.maker === f.maker);
  if (f.afford) list = list.filter(p => G.planePrice(S, 0, p.id) <= A.cash);
  if (f.route) { const [a, b] = f.route.split('-'); list = list.filter(p => p.range >= G.dist(a, b)); }
  const key = { range: p => p.range, price: p => G.planePrice(S, 0, p.id), seat: p => p.hourly / p.seats, seats: p => -p.seats, comfort: p => -p.comfort }[f.sort];
  list.sort((x, y) => key(x) - key(y));
  const routes = G.routesOf(S, 0);
  const cmp = (ui.cmp || []).filter(id => PLANE[id]);
  const market = list.map(p => {
    const q = ui.buyQty[p.id] || 1, price = G.planePrice(S, 0, p.id), cost = price * q * (q >= 5 ? 0.95 : 1);
    const isNew = S.year - p.intro <= 1, ending = p.sold - S.year <= 1;
    return `<div class="card plane">
      <div><span class="pname">${p.name}</span>${isNew ? '<span class="tag">New</span>' : ''}${price < p.price ? '<span class="tag blue">Sale</span>' : ''}${ending ? '<span class="tag grey">Last year</span>' : ''}
        <div class="spec num">${p.maker} · ${p.seats} seats · ${nf(p.range)} km · ${nf(p.speed)} km/h</div>
        <div class="spec num">$${(p.hourly / p.seats * 1000).toFixed(0)}/seat-hour · comfort ${stars(p.comfort)}</div></div>
      <div style="text-align:right" class="num">${money(price, 1)}<div class="spec">${onOrder[p.id] ? `${onOrder[p.id]} on order` : `lease ${money(G.leaseCost(S, 0, p.id))}/q`}</div></div>
      <div class="row" style="grid-column:1/-1;flex-wrap:wrap">
        <div class="stepper"><button data-act="q-" data-t="${p.id}" ${q <= 1 ? 'disabled' : ''} aria-label="Fewer">−</button><output class="num">${q}</output><button data-act="q+" data-t="${p.id}" ${q >= 10 ? 'disabled' : ''} aria-label="More">+</button></div>
        <button class="btn primary grow" data-act="buy" data-t="${p.id}" aria-label="Buy ${q} ${esc(p.maker)} ${esc(p.name)} for ${money(cost, 0)}" ${A.cash >= cost ? '' : 'disabled'}>Buy · ${money(cost, 0)}</button>
        <button class="btn grow" data-act="lease" data-t="${p.id}" aria-label="Lease ${q} ${esc(p.maker)} ${esc(p.name)}" ${A.cash >= G.leaseCost(S, 0, p.id) * q * 2 && G.leaseCost(S, 0, p.id) * q <= G.leaseRoom(S, 0) ? "" : "disabled"}>Lease · ${money(G.leaseCost(S, 0, p.id) * q * 2)} now</button>
        <button class="chip" data-act="tryplane" data-t="${p.id}">Try on a route</button>
        <button class="chip ${cmp.includes(p.id) ? 'on' : ''}" data-act="cmp" data-t="${p.id}">${cmp.includes(p.id) ? '✓ Compare' : 'Compare'}</button>
      </div></div>`;
  }).join('');
  const chip = (k, v, label) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-act="ff" data-k="${k}" data-v="${v}">${label}</button>`;
  const soon = PLANES.filter(p => p.intro > S.year && p.intro <= S.year + 3).sort((x, y) => x.intro - y.intro);
  const blocked = G.coldWar(S) ? PLANES.filter(p => S.year >= p.intro && S.year <= p.sold && G.blocClash(A.bloc, p.bloc)) : [];
  return `<h2>Fleet</h2>
  <p class="muted">New aircraft arrive next quarter. Orders of 5 or more get 5% off. Leasing costs ${Math.round(G.LEASE_RATE * 100 * 10) / 10}% of the price a quarter for at least ${G.LEASE_TERM / 4} years. Up front you pay the first quarter plus a deposit of one quarter, returned with the aircraft; handing one back early costs half the remaining payments.</p>
  <p class="note">Lessors judge you like a bank: at your ${G.rating(S, 0)} rating they will take on ${money(G.leaseRoom(S, 0))} more a quarter in lease payments (you pay ${money(G.leaseLoad(S, 0))} now).</p>
  ${exposureCard()}
  ${checksCard()}
  <h3>Your aircraft</h3>${mix}${mine || '<p class="muted">No aircraft.</p>'}${frHtml}
  <p class="note">Every ${G.CHECK_EVERY} quarters each fleet needs a heavy check. Overdue fleets, and fleets flown flat out with no spare aircraft, suffer technical delays. Owned aircraft 10+ years old can be converted to freighters once idle.</p>
  ${A.orders.length ? `<p class="note">On order: ${A.orders.map(o => `${o.n} × ${PLANE[o.type].name}${o.lease ? ' (lease)' : ''}`).join(', ')}.</p>` : ''}
  <h3>On the market · ${S.year}</h3>
  <div class="card filters">
    <div class="chips">${chip('range', 'all', 'All ranges')}${chip('range', 'short', 'Short <3,500 km')}${chip('range', 'medium', 'Medium')}${chip('range', 'long', 'Long 8,000+ km')}</div>
    <div class="chips">${chip('maker', 'all', 'All makers')}${makers.map(m => chip('maker', m, m)).join('')}</div>
    <div class="chips"><button class="chip ${f.afford ? 'on' : ''}" data-act="ff" data-k="afford" data-v="${!f.afford}">Can afford now</button>
      ${routes.length ? `<select id="ffroute" class="chip" style="padding:6px 10px" aria-label="Can fly route"><option value="">Can fly any route</option>${routes.map(r => `<option value="${r.a}-${r.b}" ${f.route === r.a + '-' + r.b ? 'selected' : ''}>Can fly ${r.a}–${r.b} (${nf(G.dist(r.a, r.b))} km)</option>`).join('')}</select>` : ''}</div>
    <div class="seg">${[['range', 'Range'], ['price', 'Price'], ['seat', 'Cost/seat'], ['seats', 'Size'], ['comfort', 'Comfort']].map(([k, n]) => `<button data-act="ff" data-k="sort" data-v="${k}" aria-pressed="${f.sort === k}">${n}</button>`).join('')}</div>
  </div>
  ${cmp.length ? compareCard(cmp) : ''}
  ${market || '<p class="muted">No aircraft match these filters.</p>'}
  ${soon.length ? `<div class="card"><span class="lbl">Coming soon</span><ul class="news" style="margin-top:8px">${soon.map(p => `<li><b>${p.name}</b> <span class="muted">· ${p.intro} · ${p.seats} seats · ${nf(p.range)} km</span></li>`).join('')}</ul></div>` : ''}
  ${blocked.length ? `<p class="note">Not sold to you during the Cold War: ${blocked.map(p => p.name).join(', ')}.</p>` : ''}`;
}
function compareCard(ids) {
  const P = ids.map(id => PLANE[id]);
  const row = (label, fn, best) => {
    const vals = P.map(fn), nums = vals.map(v => (typeof v === 'number' ? v : null));
    const win = best && nums.every(v => v != null) ? (best === 'hi' ? Math.max(...nums) : Math.min(...nums)) : null;
    return `<tr><td>${label}</td>${vals.map(v => `<td class="n ${win != null && v === win && P.length > 1 ? 'good' : ''}">${typeof v === 'number' ? nf(v) : v}</td>`).join('')}</tr>`;
  };
  return `<div class="card stack"><div class="row"><span class="lbl grow">Compare</span><button class="chip" data-act="cmpclear">Clear</button></div>
    <div class="scroll-x"><table class="tbl"><thead><tr><th></th>${P.map(p => `<th class="n">${p.name}</th>`).join('')}</tr></thead><tbody>
      ${row('Seats', p => p.seats, 'hi')}${row('Range km', p => p.range, 'hi')}${row('Speed km/h', p => p.speed, 'hi')}
      ${row('Price $M', p => G.planePrice(S, 0, p.id), 'lo')}${row('Lease $k/q', p => Math.round(G.leaseCost(S, 0, p.id) * 1000), 'lo')}
      ${row('$/seat-hour', p => Math.round(p.hourly / p.seats * 1000), 'lo')}${row('Comfort', p => stars(p.comfort))}
      ${row('On sale until', p => p.sold)}
    </tbody></table></div>${P.length < 2 ? '<p class="note">Pick another aircraft to compare.</p>' : ''}</div>`;
}

// ---------- rivals: compare chart, deals, world ----------
const METRICS = [
  ['value', 'Company value', h => h.value, v => '$' + chartFmt(v) + 'M'],
  ['cash', 'Cash', h => h.cash, v => '$' + chartFmt(v) + 'M'],
  ['rev', 'Revenue', h => h.rev, v => '$' + chartFmt(v) + 'M'],
  ['profit', 'Profit', h => h.profit, v => '$' + chartFmt(v) + 'M'],
  ['pax', 'Passengers', h => h.pax, v => chartFmt(v)],
  ['routes', 'Routes', h => h.routes, v => Math.round(v)],
  ['sat', 'Satisfaction', h => h.sat, v => Math.round(v)],
  ['share', 'Market share', h => h.share != null ? h.share * 100 : null, v => Math.round(v) + '%'],
];
function compareChart() {
  ui.metric = ui.metric || 'value';
  const M = METRICS.find(m => m[0] === ui.metric);
  const ref = S.airlines.reduce((a, B) => (B.history.length > a.length ? B.history : a), []).slice(-20);
  const labels = ref.map(qShort);
  const series = S.airlines.map((B, i) => {
    const byQ = new Map(B.history.map(h => [h.y * 4 + h.q, h]));
    return { name: B.name, color: B.color, bold: i === 0, values: ref.map(r => { const h = byQ.get(r.y * 4 + r.q); return h ? (M[2](h) ?? null) : null; }) };
  });
  return `<div class="card stack"><span class="lbl">Compare airlines</span>
    <div class="subtabs">${METRICS.map(m => `<button data-act="metric" data-v="${m[0]}" aria-pressed="${ui.metric === m[0]}">${m[1]}</button>`).join('')}</div>
    ${lineChart(series, labels, { fmt: M[3], label: M[1] + ' by airline' })}</div>`;
}
function dealsHtml(B, i) {
  if (i === 0 || B.bankrupt) return '';
  const allied = G.allied(S, i), odds = Math.round(G.codeshareOdds(S, i) * 100), T = G.takeoverTerms(S, i);
  const sale = S.routes.filter(r => r.o === i && !G.routeSaleBlock(S, r));
  const open = ui.dealOpen === i;
  return `<details ${open ? 'open' : ''} data-deal="${i}"><summary>Deals with ${esc(B.name)}</summary><div class="stack">
    <div class="row"><div class="grow"><b class="small">Codeshare</b><div class="note">${allied ? `Active for ${S.alliances.find(x => x.j === i).left} more quarters.` : `Two years. Flights touching each other's hubs win 10% more passengers, travellers can connect between your flights and theirs, and they stop attacking you. About ${odds}% likely to accept.`}</div></div>
      ${allied ? '' : `<button class="btn" data-act="codeshare" data-i="${i}" ${G.agentsLeft(S, 0) ? '' : 'disabled'}>Propose</button>`}</div>
    <div><b class="small">Buy a route</b><div class="note">Routes touching your hubs that ${esc(B.name)} would sell, with aircraft and slots. Uses a negotiator.</div>
      ${sale.length ? sale.slice(0, 6).map(r => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow small"><b>${r.a}–${r.b}</b> <span class="muted">· ${r.planes} × ${PLANE[r.type].name} · ${r.freq}/wk${r.last ? ` · ${signed(r.last.profit)}/q` : ''}</span></div>
        <button class="btn" data-act="buyroute" data-id="${r.id}" ${ME().cash >= G.routePrice(S, r) && G.agentsLeft(S, 0) ? '' : 'disabled'}>${money(G.routePrice(S, r), 0)}</button></div>`).join('') : '<p class="note">None for sale to you right now.</p>'}</div>
    <div class="row"><div class="grow"><b class="small">Takeover</b><div class="note">${T.block ? esc(T.block) : `${T.distressed ? `${esc(B.name)} is in trouble and will sell` : `${esc(B.ceo)} will accept a premium bid`}: routes, fleet, hubs, slots, businesses and debts.`}</div></div>
      ${T.block ? '' : `<button class="btn danger" data-act="takeover" data-i="${i}" ${ME().cash >= T.price ? '' : 'disabled'}>${ui.confirmTake === i ? 'Tap to confirm' : `Buy · ${money(T.price, 0)}`}</button>`}</div>
  </div></details>`;
}
function rivalsPanel() {
  // early in a year there is little to show, so Q1 shows the whole of last year (and says so)
  const useLast = !!(ME().lastYr && S.q === 0);
  const yrOf = A => (useLast ? A.lastYr : A.yr) || { pax: {} };
  const regions = REGIONS.map(R => {
    const i = G.regionLeader(S, R.id, useLast);
    const pax = S.airlines.map(A => yrOf(A).pax[R.id] || 0), tot = pax.reduce((t, v) => t + v, 0) || 1;
    return `<div class="reg" style="border-top-color:${i >= 0 ? S.airlines[i].color : 'var(--line)'}"><b>${R.name}</b>
      <div class="lf" style="margin:6px 0 4px;height:6px">${S.airlines.map((A, k) => `<i style="width:${pax[k] / tot * 100}%;background:${A.color}"></i>`).join('')}</div>
      <span class="muted">${i >= 0 ? esc(S.airlines[i].name) : 'No flights yet'}</span></div>`;
  }).join('');
  const people = S.airlines.map((B, i) => {
    const P = B.pers ? G.PERSONALITIES[B.pers] : null;
    const n = G.routesOf(S, i).length, pax = Object.values(yrOf(B).pax).reduce((t, v) => t + v, 0);
    const fl = B.fleet.reduce((t, f) => t + f.n, 0);
    const lastQ = B.lastFin ? B.lastFin.profit : null;
    return `<div class="card rival stack" style="border-left-color:${B.color}">
      <div class="person">${faceSvg(B.face, B.color, 56)}<div class="grow">
        <b style="font-family:var(--font-display);font-size:20px;letter-spacing:.02em">${esc(B.name)}</b>${i === 0 ? '<span class="tag">You</span>' : ''}${B.taken ? '<span class="tag grey">Taken over</span>' : B.bankrupt ? '<span class="tag grey">Bankrupt</span>' : ''}${G.allied(S, i) ? '<span class="tag blue">Codeshare</span>' : ''}
        <div class="muted small">${esc(B.ceo)}${P ? ` · <span style="color:${B.color}">${P.label}</span>` : ''} · home ${B.home}</div>
        ${P ? `<p class="note" style="margin-top:4px">${P.blurb}</p>` : ''}</div></div>
      ${i && !B.bankrupt && B.intent ? `<div class="intent ${B.intent.kind === 'attack' ? 'bad' : ''}"><span class="lbl">Next quarter</span> ${esc(B.intent.text)}</div>` : ''}
      ${B.bankrupt ? '' : `<div class="stats">
        <div class="stat"><small>Value</small><b>${money(G.companyValue(S, i), 0)}</b></div>
        <div class="stat"><small>Routes · fleet</small><b>${n} · ${fl}</b></div>
        <div class="stat"><small>Pax ${useLast ? S.year - 1 : 'this yr'}</small><b>${kpax(pax)}</b></div>
      </div>
      <div class="chips">${B.hubs.map(h => `<button class="chip" data-act="city" data-c="${h}">◆ ${h}</button>`).join('')}${lastQ !== null ? `<span class="chip">Last qtr <span class="num ${lastQ >= 0 ? 'good' : 'bad'}">${signed(lastQ)}</span></span>` : ''}<span class="chip">Cash ${money(B.cash, 0)}</span><span class="chip">Rating ${G.rating(S, i)}</span></div>`}
      ${dealsHtml(B, i)}
    </div>`;
  }).join('');
  const moves = (S.lastRep ? S.lastRep.rivals : []).map(m => `<li class="${m.kind === 'attack' || m.kind === 'war' ? 'bad' : ''}"><span class="dot" style="background:${S.airlines[m.i].color}"></span> ${esc(m.text)}</li>`).join('');
  const evs = S.events.filter(e => e.text).map(e => `<li class="${e.mult > 1 ? 'good' : e.mult < 1 ? 'bad' : 'hist'}">${esc(e.text)} <span class="muted">(${e.perm ? 'permanent' : `${e.left}q left`})</span></li>`).join('');
  const politics = G.coldWar(S) ? `<div class="card"><span class="lbl">Cold War</span><p class="small" style="margin-top:4px">${ME().bloc === 'N' ? 'You are neutral: you may fly to both blocs and buy aircraft from either.' : `Cities and aircraft makers of the ${ME().bloc === 'W' ? 'Eastern' : 'Western'} bloc are closed to you.`} Expected to end around ${G.COLD_WAR_ENDS}.</p></div>` : '';
  return `<h2>Rivals & world</h2>
  ${compareChart()}
  <h3>Region leaders · ${useLast ? S.year - 1 : `${S.year} so far`}</h3><div class="regions">${regions}</div>
  ${politics}
  <h3>Airlines</h3>${people}
  ${moves ? `<h3>Rival moves last quarter</h3><div class="card"><ul class="news">${moves}</ul></div>` : ''}
  <h3>World events</h3><div class="card">${evs ? `<ul class="news">${evs}</ul>` : '<p class="muted">Quiet skies. No events in effect.</p>'}</div>`;
}

// ---------- company: overview, finance, milestones ----------
function companyPanel() {
  ui.cview = ui.cview || 'overview';
  const A = ME();
  const head = `<div class="person">${faceSvg(A.face, A.color, 56)}<div><h2>${esc(A.name)}</h2><p class="muted small">${esc(A.ceo)}, CEO · founded in ${esc(CITY[A.home].name)} · ${G.ERA[S.era].name}</p></div></div>
    ${subtabs('cview', [['overview', 'Overview'], ['finance', 'Finance'], ['ms', 'Milestones']])}`;
  if (ui.cview === 'finance') return head + financeView();
  if (ui.cview === 'ms') return head + milestonesView();
  // once the game is over, show the deciding year rather than the empty new one
  const frozen = !!(S.over && A.lastYr);
  const g = G.goalStatus(S, 0, frozen), home = CITY[A.home].region, yrNow = frozen ? A.lastYr : A.yr;
  const regions = REGIONS.map(R => {
    const hub = g.hubRegions.includes(R.id), lead = g.leads.includes(R.id);
    const mine = yrNow.pax[R.id] || 0;
    const best = Math.max(0, ...S.airlines.slice(1).map(B => ((frozen ? B.lastYr : B.yr) || { pax: {} }).pax[R.id] || 0));
    return `<div class="reg" style="border-top-color:${lead ? 'var(--good)' : 'var(--line)'}"><b>${R.name}${R.id === home ? ' ★' : ''}</b>
      <div class="${hub ? 'ok' : 'no'}">${hub ? '✓ Hub' : '○ No hub'}</div>
      <div class="${lead ? 'ok' : 'no'}">${lead ? '✓ Leading' : mine ? '○ Behind' : G.routesOf(S, 0).some(r => CITY[r.a].region === R.id || CITY[r.b].region === R.id) ? '○ No passengers yet this year' : '○ No flights'}</div>
      <div class="num muted" style="font-size:11px">${kpax(mine)} vs ${kpax(best)} · ${Math.round((g.shares[R.id] || 0) * 100)}%</div></div>`;
  }).join('');
  const bizList = Object.entries(S.biz).flatMap(([code, list]) => list.filter(b => b.o === 0).map(b => ({ code, b })));
  const ads = A.ads.length ? A.ads.map(x => `<span class="chip">${REGION[x.region].name} +${Math.round(x.boost * 100)}% · ${x.left}q left</span>`).join('') : '<span class="muted small">No campaigns running.</span>';
  ui.adRegion = ui.adRegion || home;
  const reqs = S.requests.map(q => `<div class="card"><div class="row"><span class="lbl grow">${esc(CITY[q.city].name)}</span><button class="chip" data-act="city" data-c="${q.city}">View city</button></div>
    <p class="small" style="margin:6px 0">${esc(q.text)}</p><p class="note">${esc(q.effect)}</p>
    <div class="btnrow" style="margin-top:10px"><button class="btn" data-act="req" data-id="${q.id}" data-yes="0">Decline</button><button class="btn primary" data-act="req" data-id="${q.id}" data-yes="1" ${A.cash < q.cost ? 'disabled' : ''}>${q.cost ? `Pay ${money(q.cost, 0)}` : q.kind === 'contract' ? 'Sign' : 'Promise'}</button></div></div>`).join('');
  const contracts = S.contracts.map(c => { const st = G.contractStatus(S, c); return `<li class="${st.ok ? 'good' : S.turn >= c.start - 1 ? 'bad' : ''}"><b>${c.city}–${c.other}</b> · ${st.flying}/${c.minFreq} flights a week · ${c.done}/${c.need} quarters done · $${c.subsidy}M a quarter${st.ok ? '' : S.turn >= c.start - 1 ? ' · must fly it this quarter' : ''} ${st.r ? `<button class="chip" data-act="editroute" data-id="${st.r.id}">Open</button>` : `<button class="chip" data-act="advice" data-k="plan" data-v="${c.city}-${c.other}">Plan it</button>`}</li>`; }).join('');
  const promises = S.promises.map(p => `<li>Fly ${p.city}–${p.other} by ${qLabel(S.year + Math.floor((S.q + p.due - S.turn) / 4), (S.q + p.due - S.turn) % 4)}.</li>`).join('');
  const sat = Math.round(A.sat ?? 50);
  return head + `
  <div class="card"><div class="lbl">Objective · ${esc(G.OBJECTIVES[S.goal || 'world'].name)}${S.scenario ? ` · ${esc(G.SCENARIO[S.scenario].name)}` : ''}</div>${frozen ? '' : stagesHtml()}<div style="margin-top:8px">${objectiveHtml(frozen)}</div>${frozen ? '' : raceHtml()}
    ${(S.goal || 'world') === 'world' ? `<p class="note">At ${G.winRules(S).years} year-ends in a row: a hub in all 7 regions; the most passengers, and at least ${Math.round(G.winRules(S).share * 100)}% of them, in at least <b>${S.difficulty}</b> regions including your home region (★); ${G.winRules(S).routes}+ routes serving ${G.winRules(S).cities}+ cities; and a profitable year.</p>`: S.goal === "value" ? "" : `<p class="note">Meet every line at ${G.winRules(S).years} year-end${G.winRules(S).years > 1 ? 's' : ''} in a row to win.</p>`}${S.sandbox ? '<p class="note">Sandbox: you already won. Play on as long as you like.</p>' : ''}</div>
  ${boardHtml()}
  ${planHtml(A.focus || 'profit')}
  <h3>${frozen ? `${S.year - 1}, the deciding year` : 'This year so far'}</h3>
  <div class="regions">${regions}</div>
  <p class="muted small">Profit ${frozen ? 'that year' : 'this year'}: <span class="num ${yrNow.profit >= 0 ? 'good' : 'bad'}">${signed(yrNow.profit)}</span></p>
  <div class="card"><div class="row"><div class="grow"><span class="lbl">Passenger satisfaction</span><div class="meter" style="height:6px;margin-top:8px"><i style="width:${sat}%;background:${sat >= 60 ? 'var(--good)' : sat >= 40 ? 'var(--amber)' : 'var(--bad)'}"></i></div></div><b class="num" style="font-size:22px">${sat}</b></div>
    <p class="note" style="margin-top:6px">Built from aircraft comfort and age, service level, cabin, crowded flights, fares and delays. At ${sat} travellers are ${Math.round((G.satAppeal(A) - 1) * 100) >= 0 ? Math.round((G.satAppeal(A) - 1) * 100) + '% more' : -Math.round((G.satAppeal(A) - 1) * 100) + '% less'} likely to choose you. Open a route and tap “Why satisfaction is…” to see what drags it down.</p>
    ${(() => { const w = G.routesOf(S, 0).filter(r => r.last).sort((x, y) => G.routeSat(S, x) - G.routeSat(S, y)).slice(0, 3); return w.length ? `<div class="chips" style="margin-top:6px">${w.map(r => `<button class="chip" data-act="editroute" data-id="${r.id}">${r.a}–${r.b} · ${Math.round(G.routeSat(S, r))}</button>`).join('')}</div>` : ''; })()}</div>
  ${reqs ? `<h3>Requests from cities</h3>${reqs}` : ''}
  ${contracts ? `<div class="card"><span class="lbl">City contracts</span><ul class="news" style="margin-top:8px">${contracts}</ul></div>` : ''}
  ${promises ? `<div class="card"><span class="lbl">Promises you've made</span><ul class="news" style="margin-top:8px">${promises}</ul></div>` : ''}
  <h3>Businesses</h3>
  <div class="card">${bizList.length ? `<div class="kv">${bizList.map(({ code, b }) => `<span>${BUSINESSES[b.type].name} <span class="muted">· ${code}</span></span><span class="num">${signed(G.bizIncome(S, code, b))}/q</span>`).join('')}</div>` : '<p class="muted small">You own no businesses. Tap a city where you hold slots to buy hotels, agencies and more.</p>'}</div>
  <h3>Advertising</h3>
  <div class="card stack">
    <p class="muted small">Makes your flights touching a region more attractive for a year and warms relations there. Uses a negotiator.</p>
    <div class="chips">${ads}</div>
    <div class="field"><span class="lbl">Region</span><div class="chips">${REGIONS.map(R => `<button class="chip ${ui.adRegion === R.id ? 'on' : ''}" data-act="adreg" data-r="${R.id}">${R.name}</button>`).join('')}</div></div>
    <div class="seg">${G.AD_TIERS.map((t, i) => `<button data-act="adtier" data-i="${i}" aria-pressed="${ui.adTier === i}">+${Math.round(t.boost * 100)}% · ${money(t.cost, 0)}</button>`).join('')}</div>
    <button class="btn primary" data-act="ad" ${G.agentsLeft(S, 0) ? '' : 'disabled'}>Launch campaign</button></div>
  <h3>Settings</h3>
  <div class="btnrow"><button class="btn" data-act="mute">${prefs.mute ? 'Sound: off' : 'Sound: on'}</button><button class="btn" data-act="music">${prefs.music === false ? 'Music: off' : 'Music: on'}</button><button class="btn" data-act="tutreset">Show tutorial</button></div>
  <button class="btn danger" data-act="newgame">${ui.confirmNew ? 'Tap again to abandon this game' : 'Start a new game'}</button>`;
}

// Why there is no board target right now
function boardIdleText() {
  const left = G.quartersLeft(S);
  if (!S.sandbox && left <= 5) return `No new board targets ${left <= 4 ? 'in the final year' : 'now: the final year starts next quarter'}. The board will judge you on the objective: ${G.objectiveContext(S).measures[0]}.`;
  if (S.turn < 3 || ME().history.length < 4) return 'The board sets its first target after your first year.';
  return 'The board sets its next target at the end of this quarter.';
}
function boardHtml() {
  const A = ME(), b = S.board || { conf: 60 }, bp = G.boardProgress(S), conf = Math.round(b.conf);
  const color = conf >= 50 ? 'var(--good)' : conf >= 25 ? 'var(--amber)' : 'var(--bad)';
  const amts = [0.05, 0.1, 0.2].map(k => Math.max(1, Math.round(A.cash * k))).filter((v, k, a) => a.indexOf(v) === k);
  return `<div class="card stack"><div class="row"><div class="grow"><span class="lbl">Board confidence</span><div class="meter" style="height:6px;margin-top:8px"><i style="width:${Math.max(0, conf)}%;background:${color}"></i></div></div><b class="num" style="font-size:22px;color:${color}">${conf}</b></div>
    ${bp ? `<p class="small"><b>Target:</b> ${esc(bp.name)}, ${esc(bp.targetText)} ${bp.left > 0 ? `within ${bp.left} quarter${bp.left > 1 ? 's' : ''}` : 'this quarter'}. Now ${esc(bp.nowText)} ${bp.ok ? '<span class="good">✓ on track</span>' : ''}</p><p class="note">${esc(bp.why)}</p>` : `<p class="note">${boardIdleText()}</p>`}
    <p class="note">Met targets +12; missed ones cost up to 20, less for a near miss. Profitable quarters +1, losing ones −3. At zero the board replaces you.${A.dividends ? ` Dividends paid so far: ${money(A.dividends)}.` : ''}</p>
    ${A.cash > 5 ? `<div class="btnrow">${amts.map(n => `<button class="btn" data-act="dividend" data-n="${n}">Pay ${money(n, 0)} dividend</button>`).join('')}</div>` : ''}</div>`;
}

function financeView() {
  const A = ME(), f = A.lastFin, idx = G.ratingIdx(S, 0);
  const fv = G.fleetValue(S, 0), bv = G.bizValue(S, 0), debt = A.debt || 0, limit = G.borrowLimit(S, 0);
  const leasePay = A.fleet.filter(x => x.lease).reduce((t, x) => t + x.n * PLANE[x.type].price * G.LEASE_RATE, 0);
  const hist = A.history.slice(-8);
  const amt = ui.loanAmt || 25;
  const ratingColor = idx <= 2 ? 'var(--good)' : idx <= 4 ? 'var(--amber)' : 'var(--bad)';
  const h = A.hedge;
  return `
  <div class="card row" style="align-items:flex-start"><div class="grow"><span class="lbl">Credit rating</span>
    <p class="small" style="margin-top:6px">Based on profits over the last year, debt against assets, and cash. Better ratings borrow cheaper.</p></div>
    <div style="text-align:right"><div class="rating" style="color:${ratingColor}">${G.RATINGS[idx]}</div><div class="note">${(G.loanRate(S, 0) * 100).toFixed(1)}% a quarter</div></div></div>
  <h3>Balance sheet</h3>
  <div class="card"><div class="kv">
    <span>Cash</span><span class="num ${A.cash < 0 ? 'bad' : ''}">${money(A.cash)}</span>
    <span>Aircraft you own</span><span class="num">${money(fv)}</span>
    <span>Businesses</span><span class="num">${money(bv)}</span>
    <span>Bank loans</span><span class="num">${debt ? '−' + money(debt) : money(0)}</span>
    <span class="tot">Net assets</span><span class="num tot">${money(G.netAssets(S, 0))}</span>
    <span>Company value</span><span class="num"><b>${money(G.companyValue(S, 0))}</b></span>
  </div><p class="note" style="margin-top:8px">Company value is net assets plus two years of profit. ${leasePay ? `Lease payments: ${money(leasePay)} a quarter.` : ''}</p></div>
  ${S.lastRep && S.lastRep.bridge ? `<div class="card"><span class="lbl">Last quarter: from profit to cash</span>${cashBridgeHtml(S.lastRep.bridge)}</div>` : ""}
  ${forecastCard()}
  <h3>Bank loans</h3>
  <div class="card stack">
    <div class="kv"><span>Borrowed</span><span class="num">${money(debt)}${debt ? ` at ${(A.debtRate * 100).toFixed(1)}%/q` : ''}</span>
      <span>Interest per quarter</span><span class="num">${money(debt * (A.debtRate || 0))}</span>
      <span>The bank will lend</span><span class="num">${money(limit, 0)} more</span></div>
    <div class="seg">${[10, 25, 50, 100, 250].map(n => `<button data-act="loanamt" data-n="${n}" aria-pressed="${amt === n}">$${n}M</button>`).join('')}</div>
    <div class="btnrow"><button class="btn primary" data-act="borrow" ${limit >= amt ? '' : 'disabled'}>Borrow ${money(amt, 0)}</button><button class="btn" data-act="repay" ${debt > 0 && A.cash > 0 ? '' : 'disabled'}>Repay ${money(Math.min(amt, debt), 0)}</button></div>
    <p class="note">Loans have no end date; repay whenever you like. Running cash below zero uses the overdraft instead, at ${(G.overdraftRate(S, 0) * 100).toFixed(1)}% a quarter, and you go bankrupt below ${money(-G.creditLimit(S, 0), 0)}.</p></div>
  <h3>Fuel hedging</h3>
  <div class="card stack">
    <p class="small">Fuel price index: ${Math.round(G.fuelMult(S) * 100)} (100 = a normal year). ${h ? `You locked in ${Math.round(h.level * 100)}% for ${h.left} more quarter${h.left > 1 ? 's' : ''}.` : 'A hedge locks today\'s price for a year: safe against oil shocks, costly if prices fall.'}</p>
    ${h ? '' : `<button class="btn" data-act="hedge">Hedge for a year · ${money(G.hedgePrice(S, 0))}</button>`}</div>
  <h3>Results by quarter</h3>
  <div class="card stack">
    ${barChart(hist.map(x => x.profit), hist.map(qShort), { fmt: v => '$' + chartFmt(v) + 'M', label: 'Profit by quarter' })}
    ${hist.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th></th>${hist.map(x => `<th class="n">${qShort(x)}</th>`).join('')}</tr></thead><tbody>
      ${[['Revenue', x => x.rev], ['Costs', x => x.cost], ['Profit', x => x.profit], ['Quarter-end cash', x => x.cash], ['Passengers (k)', x => x.pax / 1000]].map(([n, fn]) => `<tr><td>${n}</td>${hist.map(x => { const v = fn(x); return `<td class="n ${n === 'Profit' ? (v >= 0 ? 'good' : 'bad') : ''}">${v == null ? '–' : chartFmt(v)}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>` : ''}</div>
  <h3>Last quarter in detail</h3>
  <div class="card">${f ? `<div class="kv">
    <span>Revenue</span><span class="num">${money(f.rev)}</span>
    ${f.cargo >= 0.05 ? `<span class="muted small">· of which cargo</span><span class="num muted small">${money(f.cargo)}</span>` : ''}
    ${f.biz ? `<span>Businesses</span><span class="num ${f.biz >= 0 ? '' : 'bad'}">${signed(f.biz)}</span>` : ''}
    <span>Flying costs</span><span class="num">−${money(f.flight)}</span>
    <span>Aircraft ownership</span><span class="num">−${money(f.own)}</span>
    ${f.lease ? `<span>Leases</span><span class="num">−${money(f.lease)}</span>` : ''}
    <span>Slot leases</span><span class="num">−${money(f.slots)}</span>
    <span>Offices & hubs</span><span class="num">−${money(f.overhead)}</span>
    ${f.fleetcx >= 0.05 ? `<span>Fleet mix (training, spares)</span><span class="num">−${money(f.fleetcx)}</span>` : ''}
    ${f.maint >= 0.05 ? `<span>Heavy maintenance</span><span class="num">−${money(f.maint)}</span>` : ''}
    ${f.interest ? `<span>Interest</span><span class="num">−${money(f.interest)}</span>` : ''}
    <span class="tot">Profit</span><span class="num tot ${f.profit >= 0 ? 'good' : 'bad'}">${signed(f.profit)}</span></div>` : '<p class="muted">Your first results arrive when you end the quarter.</p>'}
    <div style="margin-top:12px">${spark(A.history)}</div></div>`;
}

function milestonesView() {
  const got = G.MILESTONES.filter(m => S.ms[m.id]).length;
  const recs = loadRecords();
  return `<p class="muted small">${got} of ${G.MILESTONES.length} milestones reached in this game.</p>
  <div class="ms">${G.MILESTONES.map(m => `<div class="${S.ms[m.id] ? 'on' : ''}"><b>${S.ms[m.id] ? '★ ' : ''}${m.name}</b>${m.text}${S.ms[m.id] ? `<br><span class="num">${S.ms[m.id]}</span>` : ''}</div>`).join('')}</div>
  <h3>Records book</h3>
  <div class="card">${recs.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Airline</th><th>Era</th><th>Result</th><th class="n">Value</th></tr></thead><tbody>
    ${recs.slice(0, 10).map(r => `<tr><td>${esc(r.name)}</td><td>${r.era}</td><td>${esc(r.result)}</td><td class="n">${money(r.value, 0)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Finished games are recorded here, best company value first.</p>'}</div>`;
}

function spark(hist) {
  if (hist.length < 2) return '<p class="muted small">Cash history appears after two quarters.</p>';
  const vals = hist.map(h => h.cash), lo = Math.min(0, ...vals), hi = Math.max(...vals), w = 300, h = 64;
  const x = i => (i / (vals.length - 1)) * (w - 8) + 4, y = v => h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 14);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Cash over time">
    <line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" stroke="#24344f" stroke-dasharray="3 3"/>
    <polygon points="4,${y(lo)} ${pts} ${x(vals.length - 1)},${y(lo)}" fill="rgba(244,177,62,.12)"/>
    <polyline points="${pts}" fill="none" stroke="#f4b13e" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3.5" fill="#f4b13e"/></svg>`;
}

function renderPanel() {
  const p = $('#panel');
  if (ui.tab === 'map') { p.hidden = true; return; }
  const keep = p.hidden ? 0 : p.scrollTop;
  const html = ui.tab === 'routes' ? routesPanel() : ui.tab === 'fleet' ? fleetPanel() : ui.tab === 'world' ? rivalsPanel() : companyPanel();
  p.innerHTML = `<div class="panel-in">${html}</div>`;
  p.hidden = false;
  p.scrollTop = keep;
}

// ---------- planned routes: what each one still needs, with the next step one tap away ----------
const planCache = { k: '', list: [] };
function plannedStatuses() {
  const A = ME();
  G.prunePlanned(S, 0);
  // the key covers everything readiness depends on, including every route's schedule, so an edit
  // that frees slots or aircraft shows up at once
  const k = [S.turn, A.cash.toFixed(1), A.agentsUsed, JSON.stringify(A.orders), JSON.stringify(A.pending), (A.planned || []).map(p => p.a + p.b).join(), JSON.stringify(A.slots),
    S.routes.map(r => `${r.id}:${r.o}:${r.type}:${r.planes}:${r.freq}`).join(), A.fleet.map(f => f.type + f.n).join()].join('|');
  if (planCache.k !== k) { planCache.k = k; planCache.list = (A.planned || []).map(p => ({ p, st: G.plannedStatus(S, 0, p) })); }
  return planCache.list;
}
function plannedView() {
  const A = ME(), list = plannedStatuses();
  const intro = `<p class="muted small">Routes you mean to fly. Each row shows what is still missing and takes you straight to it. Add routes from a city, the route planner or Opportunities. Planned routes show as dotted blue arcs on the map.</p>`;
  if (!list.length) return intro + `<div class="card"><p>Nothing planned yet.</p><p class="note" style="margin-top:6px">Tap a city and choose <b>Plan for later</b>, or add one from Opportunities.</p><div class="btnrow" style="margin-top:10px"><button class="btn" data-act="sub" data-k="rview" data-v="opps">See opportunities</button></div></div>`;
  const ready = list.filter(x => x.st.ready).length;
  const rows = list.map(({ p, st }) => {
    const P = st.type && PLANE[st.type];
    const need = [];
    if (st.block) need.push(`<span class="small bad">${esc(st.block)}</span>`);
    else {
      if (P) {
        if (st.idle >= st.need) need.push(`<span class="tag" style="margin:0;background:#12321f;color:var(--good)">✓ ${st.need} × ${P.name}</span>`);
        else if (st.short <= 0) need.push(`<span class="tag blue" style="margin:0">${st.coming} × ${P.name} arriving ${qLabel(S.q === 3 ? S.year + 1 : S.year, (S.q + 1) % 4)}</span>`);
        else {
          const n = st.short, buy = st.price * n * (n >= 5 ? 0.95 : 1), lq = G.leaseCost(S, 0, st.type) * n;
          need.push(`<span class="small">Needs ${n} more ${P.name}${st.idle ? ` (${st.idle} free now)` : ''}${st.coming ? `, ${st.coming} on order` : ''}</span>`);
          need.push(`<button class="chip" data-act="planbuy" data-t="${st.type}" data-n="${n}" data-a="${st.a}" data-b="${st.b}" ${A.cash >= buy ? '' : 'disabled'}>Buy ${n} · ${money(buy, 0)}</button>`);
          need.push(`<button class="chip" data-act="planbuy" data-lease="1" data-t="${st.type}" data-n="${n}" data-a="${st.a}" data-b="${st.b}" ${A.cash >= lq * 2 && lq <= G.leaseRoom(S, 0) ? '' : 'disabled'}>Lease ${n} · ${money(lq * 2)} now</button>`);
        }
      }
      for (const x of st.slots) {
        if (x.free >= x.need) need.push(`<span class="tag" style="margin:0;background:#12321f;color:var(--good)">✓ slots ${x.c}</span>`);
        else if (x.pending) need.push(`<span class="tag blue" style="margin:0">Negotiating at ${x.c}</span>`);
        else {
          const n = [5, 10, 20].find(v => v >= x.need - x.free) || 20, blk = G.slotBlock(S, 0, x.c);
          need.push(`<span class="small">${x.c}: ${x.free} of ${x.need} slots free</span>`);
          need.push(blk || !G.agentsLeft(S, 0) ? `<button class="chip" data-act="city" data-c="${x.c}">Open ${x.c}</button>`
            : `<button class="chip" data-act="planslots" data-c="${x.c}" data-n="${n}" ${A.cash >= G.slotPrice(S, x.c) * n ? '' : 'disabled'}>Negotiate ${n} at ${x.c} · ${money(G.slotPrice(S, x.c) * n)}</button>`);
        }
      }
    }
    const pv = st.pv;
    return `<div class="card stack plan-row" style="${st.ready ? 'border-color:var(--good)' : ''}">
      <div class="row"><div class="grow"><b style="font-family:var(--font-display);font-size:20px;letter-spacing:.03em">${st.a} ⇄ ${st.b}</b>${st.ready ? '<span class="tag" style="background:#12321f;color:var(--good)">Ready</span>' : ''}
        <div class="muted small">${esc(CITY[st.b].name)} · ${nf(st.d)} km${P ? ` · ${st.freq}/wk on ${st.need} × ${P.name}${st.src === 'buy' ? ' (to buy)' : ''}` : ''}</div></div>
        ${pv ? `<div style="text-align:right"><b class="num ${pv.net + pv.knock >= 0 ? 'good' : 'bad'}">${signed(pv.net + pv.knock)}</b><div class="note">a quarter, forecast</div></div>` : ''}</div>
      <div class="need">${need.join('')}</div>
      <div class="btnrow">${!st.block && (st.ready || st.nowFreq > 0) ? `<button class="btn ${st.ready ? 'primary' : ''}" data-act="planopen" data-a="${st.a}" data-b="${st.b}">${st.ready ? 'Open route' : `Open smaller now (${st.nowFreq}/wk)`}</button>` : ''}
        <button class="btn" data-act="city" data-c="${st.b}">View ${st.b}</button><button class="btn danger" data-act="rmplan" data-a="${p.a}" data-b="${p.b}">Remove</button></div></div>`;
  }).join('');
  return intro + `<p class="small">${list.length} planned · <b class="${ready ? 'good' : ''}">${ready} ready to open</b> · forecasts assume a standard fare and service and count the effect on your other routes.</p>${rows}`;
}

// ---------- four-quarter cash forecast ----------
function forecastCard() {
  const F = G.cashForecast(S, 0);
  if (!F) return '';
  const cell = v => `<td class="n ${v < 0 ? 'bad' : ''}">${chartFmt(v)}</td>`;
  const warn = F.low < F.floor ? `<p class="small bad">At this rate cash falls below your overdraft limit (${money(F.floor, 0)}): borrow, cut costs or delay orders.</p>`
    : F.low < 0 ? `<p class="small bad">Cash goes negative within a year; you would pay overdraft interest.</p>`
    : F.lowS < 0 ? `<p class="small" style="color:var(--amber)">You are fine on current trading, but a ${Math.round(F.shock * 100)}% fall in revenue would push you into overdraft.</p>`
    : `<p class="small good">Cash stays positive, even with a ${Math.round(F.shock * 100)}% fall in revenue.</p>`;
  return `<h3>Cash forecast · next four quarters</h3>
  <div class="card stack fc"><div class="scroll-x"><table class="tbl"><thead><tr><th>$M</th>${F.rows.map(r => `<th class="n">${qShort({ y: r.y, q: r.q })}</th>`).join('')}</tr></thead><tbody>
    <tr><td>Starting cash</td>${F.rows.map(r => cell(r.start)).join('')}</tr>
    <tr><td>Trading profit</td>${F.rows.map(r => cell(r.trading)).join('')}</tr>
    <tr><td>Heavy checks due</td>${F.rows.map(r => `<td class="n">${r.checks ? '−' + chartFmt(r.checks) : '–'}</td>`).join('')}</tr>
    <tr><td>New lease payments</td>${F.rows.map(r => `<td class="n">${r.lease ? '−' + chartFmt(r.lease) : '–'}</td>`).join('')}</tr>
    <tr><td><b>Ending cash</b></td>${F.rows.map(r => `<td class="n ${r.end < 0 ? 'bad' : ''}"><b>${chartFmt(r.end)}</b></td>`).join('')}</tr>
    <tr><td class="muted">If revenue falls ${Math.round(F.shock * 100)}%</td>${F.rows.map(r => `<td class="n ${r.endS < 0 ? 'bad' : 'muted'}">${chartFmt(r.endS)}</td>`).join('')}</tr>
  </tbody></table></div>${warn}
  <p class="note">Assumes last quarter's trading carries on: revenue, flying costs, leases, slots, offices and interest (${signed(F.trading)} a quarter). Heavy checks are shown when each fleet falls due.${F.arriving ? ` ${F.arriving} aircraft arrive next quarter; bought ones are already paid for${F.newLease ? `, leased ones add ${money(F.newLease)} a quarter` : ''}.` : ''} New routes, rival moves and world events will change it.</p></div>`;
}

// ---------- objective stages ----------
// The final year of a value race: the gap, how it moved, and what closing it would take.
// The recovery check is a few dozen forecasts, so it is worked out once a quarter.
const recCache = { k: -1, v: null };
function recovery() {
  const k = S.turn;
  if (recCache.k !== k) { recCache.k = k; recCache.v = G.recoveryPlan(S); }
  return recCache.v;
}
function recoveryHtml() {
  const P = recovery();
  if (!P) return '';
  const pct = Math.round(P.reach * 100);
  const bigs = P.big.map(x => `<li>${esc(x.label)}: about <b class="good">${signed(x.byEnd)}</b> by the finish${x.cash ? `, ${money(x.cash, 0)} up front` : ''} <button class="chip" data-act="planopen" data-a="${x.a}" data-b="${x.b}" data-spec="${esc(JSON.stringify({ a: x.a, b: x.b, type: x.type, planes: x.planes, freq: x.freq }))}">Open planner</button></li>`).join('');
  const head = P.verdict === 'possible' ? `<b class="good">The gap can still be closed on paper</b>, but only by doing nearly all of it: everything found adds up to about ${money(P.total, 0)} by the finish, allowing for moves that overlap.`
    : P.verdict === 'stretch' ? `<b>A stretch:</b> everything found together covers about ${pct}% of the gap.`
    : `<b class="bad">No realistic plan found that closes the gap.</b> Everything found together covers about ${pct}% of it.`;
  return `<div class="stack" style="margin-top:8px"><span class="lbl">Recovery check</span>
    <p class="small">${head} You are <b>${money(P.gapV, 0)}</b> behind. The ${P.n} ranked move${P.n === 1 ? '' : 's'} in Best moves add about <b>${money(P.small, 0)}</b> by the finish (${signed(P.smallQ)}/q), so small fare and schedule changes ${P.small < P.gapV * 0.25 ? 'will not' : 'cannot alone'} close it.</p>
    ${bigs ? `<p class="small" style="margin-bottom:2px">Bigger plays you can afford now:</p><ul class="news">${bigs}</ul>` : '<p class="small">No new market you can afford now would add value by the finish.</p>'}
    <p class="note">${P.idle ? `You also have ${P.idle} idle aircraft: moving them onto busy routes is the cheapest extra capacity. ` : ''}Moving aircraft from half-empty routes to full ones often adds more than buying new ones.${P.verdict === 'out of reach' ? ' If the lead cannot be caught, finish as strongly as you can: avoid spending that will not count by the finish, and keep ahead of the airlines behind you.' : ''}</p></div>`;
}
function raceHtml() {
  if ((S.goal || 'world') !== 'value' || S.over || S.sandbox) return '';
  const R = G.finalRace(S, 0);
  if (!R || R.left > 4 || R.left <= 0) return '';
  const ahead = R.gap >= 0;
  const mv = R.move == null ? '' : `${R.was ? `${esc(R.rival)} has overtaken ${esc(R.was)} as your closest challenger. ` : ''}Against ${esc(R.rival)}, the gap moved <b class="${R.move >= 0 ? 'good' : 'bad'}">${signed(R.move)}</b> ${R.move >= 0 ? 'your way' : 'their way'} in ${esc(R.at)} (from ${R.gapPrev >= 0 ? 'a lead of ' : 'a deficit of '}${money(Math.abs(R.gapPrev), 0)}).`;
  const edge = Math.abs(R.edge) < 0.5 ? 'You and they are earning about the same.' : R.edge > 0
    ? `${esc(R.rival)} earns <b class="bad">${money(R.edge, 0)}</b> a year more than you (worth ${money(2 * R.edge, 0)} in value).`
    : `You earn <b class="good">${money(-R.edge, 0)}</b> a year more than ${esc(R.rival)} (worth ${money(-2 * R.edge, 0)} in value).`;
  return `<div class="card" style="border-color:${ahead ? 'var(--good, #4fd18b)' : 'var(--amber)'}"><span class="lbl">Final-year race · ${R.left} quarter${R.left === 1 ? '' : 's'} left · values at the end of ${esc(R.at)}</span>
    <div class="kv" style="margin-top:6px"><span>Your company value</span><span class="num">${money(R.me, 0)}</span>
      <span><span class="dot" style="background:${R.color}"></span> ${esc(R.rival)}</span><span class="num">${money(R.rivalValue, 0)}</span>
      <span><b>${ahead ? 'Your lead' : 'Gap to close'}</b></span><span class="num ${ahead ? 'good' : 'bad'}"><b>${money(Math.abs(R.gap), 0)}</b></span></div>
    <p class="small">${mv} ${edge}</p>
    <p class="note">${ahead ? 'Protect the lead: avoid spending that will not show up as value by the finish.' : `To close it through profit alone you need about <b>${money(R.closeQ, 1)}</b> more a quarter from now on (each extra $1M a quarter adds about ${money(R.weight, 0)} by the finish).`} Cash, aircraft and businesses count at their worth; the last year's profit counts twice.</p>${ahead ? '' : recoveryHtml()}</div>`;
}

function stagesHtml() {
  const T = G.objectiveStages(S, 0);
  if (!T) return '';
  const now = Math.min(T.reached, T.stages.length - 1), nx = T.stages[now];
  return `<div class="stages" aria-label="Objective stages">${T.stages.map((x, k) => `<i class="${k < T.reached ? 'on' : k === now ? 'now' : ''}" title="${esc(x.name)}"></i>`).join('')}</div>
    <p class="small">${T.reached ? `Stage ${T.reached} of ${T.stages.length} reached: <b>${esc(T.stages[T.reached - 1].name)}</b>. ` : ''}${T.reached < T.stages.length ? `Next: <b>${esc(nx.name)}</b>` : '<b class="good">Every stage complete.</b>'}</p>
    ${T.reached < 4 ? `<p class="note">Reward for reaching it: ${esc(G.STAGE_REWARDS[T.reached])}</p>` : ''}
    ${T.reached < T.stages.length ? `<div class="kv small" style="margin:4px 0 6px">${nx.reqs.map(r => `<span>${r.ok ? '✓' : '○'} ${esc(r.label)}</span><span class="num ${r.ok ? 'good' : ''}">${esc(r.val)}</span>`).join('')}</div>` : ''}
    ${paceHtml()}
    <div class="lbl" style="margin-top:8px">Final objective</div>`;
}

// ---------- fleet: honest utilisation, commitments before buying, heavy-check schedule ----------
function removableText(t) {
  const rs = G.routesOf(S, 0).filter(r => r.type === t).map(r => ({ r, x: r.planes - Math.max(1, Math.ceil(r.freq * G.rtHours(t, G.dist(r.a, r.b)) / G.HOURS_PER_PLANE)) })).filter(z => z.x > 0);
  if (rs.length) return `${rs.reduce((n, z) => n + z.x, 0)} could come off ${rs.map(z => `${z.r.a}–${z.r.b}${z.x > 1 ? ` (${z.x})` : ''}`).join(', ')} without cutting flights`;
  return 'spare flying hours, but every route still needs the aircraft it has; add flights to use them';
}
function exposureCard() {
  const A = ME(), idle = G.idleTotal(S, 0), arriving = A.orders.reduce((t, o) => t + o.n, 0);
  const plans = plannedStatuses().filter(x => !x.st.block && x.st.type);
  const secured = plans.filter(x => x.st.slotsOk).reduce((t, x) => t + x.st.need, 0);
  const waiting = plans.filter(x => !x.st.slotsOk && x.st.slots.some(z => z.free < z.need && z.pending)).reduce((t, x) => t + x.st.need, 0);
  if (!idle && !arriving && !plans.length) return '';
  const types = A.fleet.map(f => f.type), avgOwn = types.length ? types.reduce((t, x) => t + PLANE[x].price * G.OWN_RATE, 0) / types.length : 0;
  const spare = idle + arriving - secured, atRisk = Math.max(0, Math.min(waiting, idle + arriving - secured));
  return `<div class="card stack"><span class="lbl">Before you buy · aircraft and work</span>
    <div class="kv small"><span>Idle now</span><span class="num">${idle}</span><span>Arriving next quarter</span><span class="num">${arriving}</span>
      <span>Needed by planned routes with slots secured</span><span class="num">${secured}</span><span>Needed by routes still waiting on negotiations</span><span class="num">${waiting}</span>
      <span><b>Without confirmed work</b></span><span class="num ${spare > 0 ? 'bad' : 'good'}"><b>${Math.max(0, spare)}</b></span></div>
    <p class="note">${spare > 0 ? `${spare} aircraft have no confirmed route. ${atRisk ? `${atRisk} of them depend on talks that may fail; if they do, those aircraft would cost about ${money(atRisk * avgOwn)} a quarter standing idle. ` : ''}Win slots first, then buy for routes that are ready.` : 'Every aircraft you have or have ordered has work lined up.'} Planned routes (Routes › Planned) count here.</p></div>`;
}
function checksCard() {
  const A = ME(), list = G.fleetTypes(A).map(t => ({ t, due: G.CHECK_EVERY - G.sinceCheck(A, t), cost: G.checkCost(S, 0, t) })).sort((x, y) => x.due - y.due);
  if (!list.length) return '';
  return `<div class="card stack"><div class="row"><span class="lbl grow">Heavy checks</span><button class="chip ${A.autoCheck ? 'on' : ''}" data-act="autocheck" aria-pressed="${!!A.autoCheck}">${A.autoCheck ? '✓ Book automatically' : 'Book automatically'}</button></div>
    <div class="kv small">${list.map(x => `<span>${PLANE[x.t].name}</span><span class="num ${x.due <= 0 ? 'bad' : x.due <= 1 ? '' : 'muted'}">${x.due <= 0 ? `overdue ${-x.due}q` : x.due === 1 ? 'next quarter' : `in ${x.due} quarters`} · ${money(x.cost)}</span>`).join('')}</div>
    <p class="note">${A.autoCheck ? 'Each fleet is checked the quarter it falls due, if you have the cash. ' : ''}Next 4 quarters: ${money(list.filter(x => x.due <= 4).reduce((t, x) => t + x.cost, 0))} in checks. The cash forecast in Company › Finance includes them.</p></div>`;
}

// ---------- objective pace ----------
function paceHtml() {
  const P = G.objectivePace(S, 0);
  if (!P || P.have >= P.T) return '';
  const ok = P.recent != null && P.recent >= P.need;
  return `<p class="note">Pace: ${P.recent != null ? `+${P.recent} routes in the last year` : 'no full year yet'}. To reach ${P.T} routes with time left to hold the objective you need about <b>${P.need === Infinity ? 'more time than is left' : Math.ceil(P.need) + ' a year'}</b>${P.recent != null ? ` · <b class="${ok ? 'good' : 'bad'}">${ok ? 'on pace' : 'behind pace'}</b>` : ''}.</p>`;
}

// ---------- ranked decisions (shared with the quarter report) ----------
const decCache = { k: -1, list: [] };
function decisionsList() {
  const k = S.turn + ':' + (ME().focus || 'profit');
  if (decCache.k !== k) { decCache.k = k; decCache.list = G.decisions(S); }
  return decCache.list;
}
// The whole cash a move needs, split into aircraft (which keep most of their value) and slot-talk
// deposits (spent for good), so "none" only ever means no money at all.
function cashNeedText(b) {
  if (!b.cash) return 'Cash needed: none';
  const parts = [];
  if (b.planeCash) parts.push(`${money(b.planeCash, 0)} aircraft`);
  if (b.slotCash) parts.push(`${money(b.slotCash, 0)} slot deposit${(b.slots || []).length > 1 ? 's' : ''}, not refunded`);
  return `Cash needed: <b>${money(b.cash, 0)}</b>${parts.length > 1 || b.slotCash ? ` (${parts.join(' + ')})` : ''}${ME().cash < b.cash ? ' <span class="bad">· more than you have</span>' : ''}`;
}
function decisionsHtml(inPanel) {
  const list = decisionsList(), A = ME(), c0 = G.objectiveContext(S), ctx = { ...c0, byDeadline: !!S.scenario || c0.cashCounts };
  if (!list.length) return inPanel ? '' : '<p class="muted small">No clear profit-raising moves found this quarter.</p>';
  const rows = list.map(x => {
    const b = x.best, r = x.route != null && S.routes.find(z => z.id === x.route);
    if (!b) return `<li class="bad">${esc(x.why)}. No fare, frequency or service change helps: consider closing it. ${r ? `<button class="chip" data-act="editroute" data-id="${r.id}">Open</button>` : ''}</li>`;
    const needs = [];
    if (b.buy) needs.push(`<button class="chip" data-act="decbuy" data-t="${b.spec.type}" data-n="${b.buy}" ${A.cash >= b.planeCash ? '' : 'disabled'}>Buy ${b.buy} × ${PLANE[b.spec.type].name} · ${money(b.planeCash, 0)}</button>`);
    for (const z of b.slots) needs.push(G.slotBlock(S, 0, z.c) || !G.agentsLeft(S, 0) ? `<span class="small">needs ${z.n} more slots at ${z.c}${G.airportFree(S, z.c) <= 0 ? ' (airport full: buy from a rival)' : ''}</span> <button class="chip" data-act="city" data-c="${z.c}">Open ${z.c}</button>`
      : `<button class="chip" data-act="decslots" data-c="${z.c}" data-n="${[5, 10, 20].find(v => v >= z.n) || 20}">Negotiate ${[5, 10, 20].find(v => v >= z.n) || 20} slots at ${z.c}</button>`);
    const go = x.plan ? `<button class="chip" data-act="planopen" data-a="${x.plan.a}" data-b="${x.plan.b}"${b.spec ? ` data-spec="${esc(JSON.stringify(b.spec))}"` : ''}>Open planner</button>`
      : b.now ? `<button class="chip" data-act="decide" data-id="${x.route}" data-spec="${esc(JSON.stringify(b.spec))}">Load in planner</button>` : '';
    const alt = x.alt ? `<div class="note">Possible right now: ${esc(x.alt.label)}, <span class="good">${signed(x.alt.gain)}</span>/q <button class="chip" data-act="decide" data-id="${x.route}" data-spec="${esc(JSON.stringify(x.alt.spec))}">Load</button></div>` : '';
    const q = ctx.byDeadline ? `<div class="note"><span class="tag ${b.kind === 'expand' ? 'blue' : ''}">${b.kind === 'expand' ? 'Expand capacity' : 'Adjust operations'}</span> ${cashNeedText(b)}${b.cash ? ` · pays back in ${b.payback === Infinity || b.payback > 40 ? 'over 10 years' : `${Math.ceil(b.payback)} quarter${Math.ceil(b.payback) === 1 ? '' : 's'}`}${b.payback > ctx.left ? ' <span class="muted">(after the finish)</span>' : ''}` : ''}${b.lag ? " · earns from next quarter" : ""} · company value at the finish: <b class="${b.byEnd >= 0 ? 'good' : 'bad'}">${signed(b.byEnd)}</b></div>`
      : `<div class="note"><span class="tag ${b.kind === 'expand' ? 'blue' : ''}">${b.kind === 'expand' ? 'Expand capacity' : 'Adjust operations'}</span> ${cashNeedText(b)}${b.cash ? ` · pays back in ${b.payback === Infinity || b.payback > 40 ? 'over 10 years' : `${Math.ceil(b.payback)} quarters`}` : ''}</div>`;
    const objTag = b.objBonus > 0.05 ? ` <span class="tag blue" title="Passengers here count toward your objective">Helps objective: ${b.objRegions.map(z => esc(REGION[z].name)).join(', ')}</span>` : '';
    return `<li>${esc(x.why)}: <b>${esc(b.label)}</b>${objTag} · <b class="good">${signed(b.gain)}</b>/q ${go}${q}${needs.length ? `<div style="margin-top:4px">${b.now ? '' : '<span class="small muted">First: </span>'}${needs.join(' ')}</div>` : ''}${alt}</li>`;
  }).join('');
  const ex = list.filter(x => x.best && x.best.kind === 'expand')[0], ad = list.filter(x => x.best && x.best.kind === 'adjust')[0];
  const head = `<p class="small" style="margin:2px 0 6px"><span class="tag">Objective · ${esc(ctx.name)}</span> ${ctx.byDeadline ? `${ctx.left} quarter${ctx.left === 1 ? '' : 's'} to the finish. Ranked by what each move adds to company value at the finish: profit banked until then plus twice a year's profit at the end. Aircraft you buy count at 70% of their price from the day they arrive, slot deposits count for nothing, and anything that waits for a delivery or slot talks earns from next quarter.` : `Measured by ${esc(ctx.measures.slice(0, 2).join(' and '))}.`}</p>`;
  const vs = ex && ad ? `<p class="note">Best expansion: ${esc(ex.best.label)} (${signed(ctx.byDeadline ? ex.best.byEnd : ex.best.gain)}${ctx.byDeadline ? '' : '/q'}, ${ex.best.cash ? money(ex.best.cash, 0) + ' up front' : 'no cash up front'}). Best adjustment: ${esc(ad.best.label)} (${signed(ctx.byDeadline ? ad.best.byEnd : ad.best.gain)}${ctx.byDeadline ? '' : '/q'}, no cash up front).</p>` : '';
  const P = (S.goal || 'world') === 'value' && !S.sandbox && G.quartersLeft(S) <= 4 ? recovery() : null;
  const scale = P ? `<p class="small ${P.small < P.gapV * 0.5 ? 'bad' : ''}">Together these moves add about ${money(P.small, 0)} by the finish; you are ${money(P.gapV, 0)} behind. ${P.small < P.gapV ? 'They help, but they will not close the gap on their own: see the recovery check in the race card.' : ''}</p>` : '';
  return `<div class="card stack"><span class="lbl">Best moves this quarter</span>${head}${scale}<ol class="plan">${rows}</ol>${vs}
    <p class="note">${ctx.byDeadline ? 'Each move also shows its change in company profit a quarter' : ['world', 'regional', 'lowcost'].includes(ctx.obj) ? `Ranked by the change in company profit a quarter plus the passengers it wins ${ctx.obj === 'world' ? 'in regions you do not yet lead' : ctx.obj === 'regional' ? 'in your home region' : 'anywhere'} (your objective)` : 'Ranked by the change in company profit a quarter'}${(A.focus || 'profit') === 'share' ? ', with extra weight on passengers for your market-share goal' : ''}, counting the effect on your other routes, new slot fees and the cost of any aircraft you would need to buy.</p></div>`;
}

// ---------- quick-edit route table with a combined forecast ----------
function routeTable(rs) {
  const D = ui.rdraft || {}, ids = Object.keys(D).map(Number).filter(id => S.routes.some(r => r.id === id));
  let summary = '', fc = null, fc0 = null;
  if (ids.length) {
    const changes = Object.fromEntries(ids.map(id => [id, D[id]]));
    const base = G.runNetwork(S), alt = G.runNetwork(S, S.routes.map(r => (changes[r.id] ? { ...r, ...changes[r.id] } : r)));
    const tot = n => [...n.R.values()].filter(x => x.r.o === 0).reduce((t, x) => t + x.revQ - x.costQ, 0);
    const slotD = ids.reduce((t, id) => { const r = S.routes.find(x => x.id === id); return t + (D[id].freq - r.freq) * (G.slotFee(S, r.a) + G.slotFee(S, r.b)); }, 0);
    const delta = tot(alt) - tot(base) - slotD;
    fc = alt.R; fc0 = base.R;
    // joint checks: aircraft hours per route, and slot use per airport across all the changes together
    const errs = [], use = {};
    for (const id of ids) {
      const r = S.routes.find(x => x.id === id), d = G.dist(r.a, r.b);
      if (D[id].freq > G.maxFreq(r.type, r.planes, d)) errs.push(`${r.a}–${r.b}: ${r.planes} aircraft fly at most ${G.maxFreq(r.type, r.planes, d)} a week (open the route to add aircraft)`);
      for (const c of [r.a, r.b]) use[c] = (use[c] || 0) + D[id].freq - r.freq;
    }
    for (const [c, n] of Object.entries(use)) if (n > Math.max(0, G.slotsAvail(S, 0, c))) errs.push(`${c}: these changes need ${n} more slots, ${Math.max(0, G.slotsAvail(S, 0, c))} free`);
    summary = `<div class="card stack" style="position:sticky;top:0;z-index:2;border-color:var(--amber)"><div class="row"><div class="grow"><b>${ids.length} change${ids.length > 1 ? 's' : ''}</b> · change in company profit <b class="${delta >= 0 ? 'good' : 'bad'}">${signed(delta)}</b>/q</div>
      <button class="btn" data-act="drclear">Discard</button><button class="btn primary" data-act="drapply" ${errs.length ? 'disabled' : ''}>Apply</button></div>
      ${errs.length ? `<p class="small bad">${errs.map(esc).join('<br>')}</p>` : '<p class="note">Forecast for all the changes together, including their effect on each other and on connecting passengers.</p>'}</div>`;
  }
  const rows = rs.map(r => {
    const d = D[r.id] || { freq: r.freq, fare: r.fare }, L = r.last, ch = D[r.id] ? 'background:rgba(244,177,62,.08)' : '';
    return `<tr style="${ch}"><td data-act="editroute" data-id="${r.id}" style="cursor:pointer"><b>${r.a}–${r.b}</b><div class="note">${r.planes} × ${PLANE[r.type].name}</div></td>
      <td class="n"><span class="mstep"><button data-act="dr" data-id="${r.id}" data-k="freq" data-v="-1" aria-label="Fewer flights">−</button><output class="num ${d.freq !== r.freq ? 'good' : ''}">${d.freq}</output><button data-act="dr" data-id="${r.id}" data-k="freq" data-v="1" aria-label="More flights">+</button></span></td>
      <td class="n"><span class="mstep"><button data-act="dr" data-id="${r.id}" data-k="fare" data-v="-5" aria-label="Lower fare">−</button><output class="num ${d.fare !== r.fare ? 'good' : ''}">${pct(d.fare)}</output><button data-act="dr" data-id="${r.id}" data-k="fare" data-v="5" aria-label="Higher fare">+</button></span></td>
      ${(() => {
        // last quarter's results, and for any route with a pending change (or touched by one) the forecast too
        // a route counts as affected when the forecast with the changes differs from the forecast without them
        const F = fc && fc.get(r.id), F0 = fc0 && fc0.get(r.id), fp = F ? F.revQ - F.costQ : null;
        const moved = F && F0 && (D[r.id] || Math.abs(F.lf - F0.lf) > 0.005 || Math.abs(fp - (F0.revQ - F0.costQ)) > 0.05);
        const dl = moved ? Math.round((F.lf - F0.lf) * 100) : 0, dp = moved ? fp - (F0.revQ - F0.costQ) : 0;
        const lf = `<span>${L ? Math.round(L.lf * 100) + '%' : '–'}</span>${moved ? `<div class="note">next: <b>${Math.round(F.lf * 100)}%</b> (${dl >= 0 ? '+' : '−'}${Math.abs(dl)} pts)</div>` : ''}`;
        const pr = `<span class="${L ? (L.profit >= 0 ? 'good' : 'bad') : ''}">${L ? chartFmt(L.profit) : '–'}</span>${moved ? `<div class="note">next: <b>${chartFmt(fp)}</b> (<span class="${dp >= 0 ? 'good' : 'bad'}">${signed(dp)}</span>)</div>` : ''}`;
        return `<td class="n">${lf}</td><td class="n">${pr}</td></tr>`;
      })()}`;
  }).join('');
  return `${summary}<p class="muted small">Change flights a week and fares on several routes, see the combined effect, then apply them together. Tap a route name for the full planner.</p>
    <div class="card scroll-x"><table class="tbl"><thead><tr><th>Route</th><th class="n">Flights/wk</th><th class="n">Fare</th><th class="n">Load<div class="note">last quarter</div></th><th class="n" title="Tickets and cargo minus flying costs: before aircraft ownership, slots, offices and interest">Route profit $M<div class="note">last quarter</div></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Load and route profit are last quarter's results. While you have changes pending, each route they affect (directly or through connecting passengers) also shows its forecast for next quarter with the changes, and in brackets how much of that the changes themselves cause.</p>`;
}
