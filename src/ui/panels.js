// ---------- full-screen tabs: routes, fleet, rivals, company ----------
function subtabs(key, items) {
  return `<div class="subtabs" role="tablist">${items.map(([k, n]) => `<button data-act="sub" data-k="${key}" data-v="${k}" aria-pressed="${ui[key] === k}">${n}</button>`).join('')}</div>`;
}

// ---------- routes: list, slots ledger, opportunities ----------
function routesPanel() {
  ui.rview = ui.rview || 'list';
  const head = `<h2>Network</h2>${subtabs('rview', [['list', 'Routes'], ['slots', 'Slots'], ['opps', 'Opportunities']])}`;
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
  return head + `<p class="muted">${rs.length} route${rs.length > 1 ? 's' : ''} · route profit last quarter <span class="num ${tot >= 0 ? 'good' : 'bad'}">${signed(tot)}</span> before aircraft, slot and office costs.</p>
  ${f && f.pax ? `<p class="note">Last quarter you carried <b>${nf(f.pax)}</b> passenger journeys, <b>${nf(f.conn || 0)}</b> of them connecting through a hub. Route figures count boardings instead (${nf(boards)}): a connecting journey boards two flights, so it appears on both routes.</p>` : ''}
  ${exposed.length ? `<div class="card" style="border-color:var(--amber)"><span class="lbl" style="color:var(--amber)">Fat margins attract challengers</span><p class="small" style="margin-top:4px">${exposed.slice(0, 3).map(x => `${x.r.a}–${x.r.b} (${Math.round(x.m * 100)}% margin, fare ${pct(x.r.fare)})`).join(', ')} ${exposed.length > 1 ? 'have' : 'has'} no competition. Rivals can win traffic rights to any route this profitable, hub or no hub. Adding seats or easing the fare makes it less tempting.</p></div>` : ''}
  <div class="chips">${[['profit', 'Profit'], ['margin', 'Margin'], ['lf', 'Load'], ['sat', 'Lowest satisfaction'], ['comp', 'Most competition']].map(([k, n]) => `<button class="chip ${ui.rsort === k ? 'on' : ''}" data-act="rsort" data-v="${k}">${n}</button>`).join('')}</div>
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
  const missing = REGIONS.filter(R => !ME().hubs.some(h => CITY[h].region === R.id));
  return `${missing.length ? `<div class="card"><span class="lbl">Regions without your hub</span><p class="small" style="margin-top:4px">${missing.map(R => R.name).join(', ')}. You need a hub in all seven to win: fly to a major city there first, then build. Routes into these regions are ranked higher below.</p></div>` : ''}
  <p class="muted small">The biggest markets you could fly from your hubs, after allowing for rivals' seats and passengers your network would feed in. Revenue is a rough quarterly estimate at standard fares.</p>
    <button class="btn" data-act="heat">${ui.heat ? 'Hide them on the map' : 'Show them on the map'}</button>
    ${ops.length ? ops.map(o => `<div class="card stack">
      <div class="row"><div class="grow"><b style="font-family:var(--font-display);font-size:20px;letter-spacing:.03em">${o.a} ⇄ ${o.b}</b>
        ${o.newRegion ? `<span class="tag blue">New region · ${REGION[CITY[o.b].region].name}</span>` : ''}
        <div class="muted small">${esc(CITY[o.b].name)} · ${nf(o.d)} km${o.rivals ? ` · ${o.rivals} rival${o.rivals > 1 ? 's' : ''}` : ' · nobody flies it'}</div></div>
        <div style="text-align:right"><b class="num good">~${money(o.value, 0)}</b><div class="note">a quarter</div></div></div>
      <div class="note">${nf(o.unmet)} travellers a week unserved${o.feed ? `, including ~${nf(o.feed)} connecting from your network` : ''}. ${o.inRange ? '' : 'None of your aircraft has the range yet. '}${o.slots >= 2 ? `${o.slots} free slots at both ends.` : `You need slots at ${G.slotsAvail(S, 0, o.a) < 2 ? o.a : o.b}.`}</div>
      <div class="btnrow">${o.slots >= 2 && o.inRange ? `<button class="btn primary" data-act="planpair" data-a="${o.a}" data-b="${o.b}">Plan route</button>` : ''}<button class="btn" data-act="city" data-c="${G.slotsAvail(S, 0, o.a) < 2 ? o.a : o.b}">Open ${G.slotsAvail(S, 0, o.a) < 2 ? o.a : o.b}</button></div>
    </div>`).join('') : '<p class="muted">No big untapped markets within reach. Build hubs in new regions to find more.</p>'}`;
}

// ---------- fleet: your aircraft, the market with filters, compare, lease ----------
const stars = c => { const n = G.clamp(Math.round((c - 0.7) * 10), 1, 5); return '★'.repeat(n) + '☆'.repeat(5 - n); };
function fleetPanel() {
  const A = ME();
  const onOrder = {}; A.orders.forEach(o => (onOrder[o.type] = (onOrder[o.type] || 0) + o.n));
  const owned = G.fleetTypes(A);
  const mine = owned.map(t => {
    const P = PLANE[t], n = G.fleetCount(A, t), idle = G.idle(S, 0, t), age = G.avgAge(S, A, t), leased = G.leasedCount(A, t);
    const oldest = A.fleet.filter(f => f.type === t && !f.lease).sort((x, y) => x.built - y.built)[0];
    const sellable = Math.min(idle, n - leased), returnable = Math.min(idle, leased);
    const hrs = G.routesOf(S, 0).filter(r => r.type === t).reduce((h, r) => h + r.freq * G.rtHours(t, G.dist(r.a, r.b)), 0);
    const util = n > idle ? Math.round(hrs / ((n - idle) * G.HOURS_PER_PLANE) * 100) : 0;
    const R = G.reliability(S, 0, t), since = G.sinceCheck(A, t), convErr = G.canConvert(S, 0, t);
    const chk = R.over ? `<b class="bad">heavy check ${R.over} quarter${R.over > 1 ? 's' : ''} overdue</b>` : R.due <= 1 ? `<b style="color:var(--amber)">heavy check due ${R.due <= 0 ? 'now' : 'next quarter'}</b>` : `next heavy check in ${R.due} quarters`;
    return `<div class="card plane">
      <div><span class="pname">${P.name}</span>${S.year > P.sold ? '<span class="tag grey">Out of production</span>' : ''}${leased ? `<span class="tag blue">${leased} leased</span>` : ''}
        <div class="spec num">${P.seats} seats · ${nf(P.range)} km · ${nf(P.speed)} km/h</div></div>
      <div style="text-align:right" class="num">${n} in fleet<div class="spec">${idle > 0 ? `<span style="color:var(--amber)">${idle} idle</span>` : 'all flying'} · avg ${age.toFixed(0)} yrs</div></div>
      <div style="grid-column:1/-1"><div class="lf" style="height:6px" title="Share of flying hours used"><i style="width:${Math.min(100, util)}%;background:${util < 60 ? 'var(--bad)' : 'var(--amber)'}"></i></div>
        <div class="note">${n > idle ? `Aircraft in service fly ${util}% of their available hours${util < 60 ? ' · some routes have more aircraft than their schedule needs' : ''}` : 'None in service'}${idle ? ` · ${idle} idle` : ''}</div></div>
      ${sellable || returnable ? `<div class="btnrow" style="grid-column:1/-1">${sellable ? `<button class="btn" data-act="sell" data-t="${t}">Sell oldest · ${money(G.planeValue(S, t, S.year - oldest.built), 1)}</button>` : ''}${returnable ? `<button class="btn" data-act="retlease" data-t="${t}">Return 1 lease · fee ${money(G.leaseCost(S, 0, t))}</button>` : ''}</div>` : ''}
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
        <button class="btn primary grow" data-act="buy" data-t="${p.id}" ${A.cash >= cost ? '' : 'disabled'}>Buy · ${money(cost, 0)}</button>
        <button class="btn grow" data-act="lease" data-t="${p.id}" ${A.cash >= G.leaseCost(S, 0, p.id) * q ? '' : 'disabled'}>Lease</button>
        <button class="chip ${cmp.includes(p.id) ? 'on' : ''}" data-act="cmp" data-t="${p.id}">${cmp.includes(p.id) ? '✓ Compare' : 'Compare'}</button>
      </div></div>`;
  }).join('');
  const chip = (k, v, label) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-act="ff" data-k="${k}" data-v="${v}">${label}</button>`;
  const soon = PLANES.filter(p => p.intro > S.year && p.intro <= S.year + 3).sort((x, y) => x.intro - y.intro);
  const blocked = G.coldWar(S) ? PLANES.filter(p => S.year >= p.intro && S.year <= p.sold && G.blocClash(A.bloc, p.bloc)) : [];
  return `<h2>Fleet</h2>
  <p class="muted">New aircraft arrive next quarter. Orders of 5 or more get 5% off. Leasing costs ${Math.round(G.LEASE_RATE * 100 * 10) / 10}% of the price a quarter instead of paying up front; the first quarter is due now.</p>
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
  const evs = S.events.map(e => `<li class="${e.mult > 1 ? 'good' : e.mult < 1 ? 'bad' : 'hist'}">${esc(e.text)} <span class="muted">(${e.left}q left)</span></li>`).join('');
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
  const g = G.goalStatus(S, 0, false), home = CITY[A.home].region;
  const regions = REGIONS.map(R => {
    const hub = g.hubRegions.includes(R.id), lead = g.leads.includes(R.id);
    const mine = A.yr.pax[R.id] || 0;
    const best = Math.max(0, ...S.airlines.slice(1).map(B => B.yr.pax[R.id] || 0));
    return `<div class="reg" style="border-top-color:${lead ? 'var(--good)' : 'var(--line)'}"><b>${R.name}${R.id === home ? ' ★' : ''}</b>
      <div class="${hub ? 'ok' : 'no'}">${hub ? '✓ Hub' : '○ No hub'}</div>
      <div class="${lead ? 'ok' : 'no'}">${lead ? '✓ Leading' : mine ? '○ Behind' : '○ No flights'}</div>
      <div class="num muted" style="font-size:11px">${kpax(mine)} vs ${kpax(best)}</div></div>`;
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
  <div class="card"><div class="lbl">Objective · ${esc(G.OBJECTIVES[S.goal || 'world'].name)}${S.scenario ? ` · ${esc(G.SCENARIO[S.scenario].name)}` : ''}</div><div style="margin-top:8px">${objectiveHtml(false)}</div>
    ${(S.goal || 'world') === 'world' ? `<p class="note">At the end of any year: a hub in all 7 regions, the most passengers in at least <b>${S.difficulty}</b> regions including your home region (★), and a profitable year.</p>` : ''}</div>
  ${boardHtml()}
  ${planHtml(A.focus || 'profit')}
  <h3>This year so far</h3>
  <div class="regions">${regions}</div>
  <p class="muted small">Profit this year: <span class="num ${A.yr.profit >= 0 ? 'good' : 'bad'}">${signed(A.yr.profit)}</span></p>
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
  <div class="btnrow"><button class="btn" data-act="mute">${prefs.mute ? 'Sound: off' : 'Sound: on'}</button><button class="btn" data-act="tutreset">Show tutorial</button></div>
  <button class="btn danger" data-act="newgame">${ui.confirmNew ? 'Tap again to abandon this game' : 'Start a new game'}</button>`;
}

function boardHtml() {
  const A = ME(), b = S.board || { conf: 60 }, bp = G.boardProgress(S), conf = Math.round(b.conf);
  const color = conf >= 50 ? 'var(--good)' : conf >= 25 ? 'var(--amber)' : 'var(--bad)';
  const amts = [0.05, 0.1, 0.2].map(k => Math.max(1, Math.round(A.cash * k))).filter((v, k, a) => a.indexOf(v) === k);
  return `<div class="card stack"><div class="row"><div class="grow"><span class="lbl">Board confidence</span><div class="meter" style="height:6px;margin-top:8px"><i style="width:${Math.max(0, conf)}%;background:${color}"></i></div></div><b class="num" style="font-size:22px;color:${color}">${conf}</b></div>
    ${bp ? `<p class="small"><b>Target:</b> ${esc(bp.name)}, ${esc(bp.targetText)} ${bp.left > 0 ? `within ${bp.left} quarter${bp.left > 1 ? 's' : ''}` : 'this quarter'}. Now ${esc(bp.nowText)} ${bp.ok ? '<span class="good">✓ on track</span>' : ''}</p><p class="note">${esc(bp.why)}</p>` : '<p class="note">The board sets its first target after your first year.</p>'}
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
    <p class="small">Fuel now costs ${Math.round(G.fuelMult(S) * 100)}% of the 2000 price. ${h ? `You locked in ${Math.round(h.level * 100)}% for ${h.left} more quarter${h.left > 1 ? 's' : ''}.` : 'A hedge locks today\'s price for a year: safe against oil shocks, costly if prices fall.'}</p>
    ${h ? '' : `<button class="btn" data-act="hedge">Hedge for a year · ${money(G.hedgePrice(S, 0))}</button>`}</div>
  <h3>Results by quarter</h3>
  <div class="card stack">
    ${barChart(hist.map(x => x.profit), hist.map(qShort), { fmt: v => '$' + chartFmt(v) + 'M', label: 'Profit by quarter' })}
    ${hist.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th></th>${hist.map(x => `<th class="n">${qShort(x)}</th>`).join('')}</tr></thead><tbody>
      ${[['Revenue', x => x.rev], ['Costs', x => x.cost], ['Profit', x => x.profit], ['Cash', x => x.cash], ['Passengers (k)', x => x.pax / 1000]].map(([n, fn]) => `<tr><td>${n}</td>${hist.map(x => { const v = fn(x); return `<td class="n ${n === 'Profit' ? (v >= 0 ? 'good' : 'bad') : ''}">${v == null ? '–' : chartFmt(v)}</td>`; }).join('')}</tr>`).join('')}
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
