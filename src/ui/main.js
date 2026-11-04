// ---------- top bar, tutorial coach, action dispatcher, boot ----------
let lastFlap = '';
function renderTop() {
  if (!S) return;
  const A = ME();
  $('#brand').innerHTML = `${faceSvg(A.face, A.color, 32)}<span class="brand-name">${esc(A.name)}</span>`;
  const label = `Q${S.q + 1} ${S.year}`;
  const flap = $('#flap');
  flap.innerHTML = [...label].map(ch => (ch === ' ' ? '<span class="gap"></span>' : `<span>${ch}</span>`)).join('');
  if (label !== lastFlap) { flap.classList.remove('flip'); void flap.offsetWidth; if (lastFlap) flap.classList.add('flip'); lastFlap = label; }
  const cash = $('#cash');
  cash.textContent = money(A.cash);
  cash.className = A.cash < 0 ? 'bad' : '';
  $('#pips').innerHTML = Array.from({ length: G.agentsOf(S, 0) }, (_, k) => `<span class="pip ${k < G.agentsLeft(S, 0) ? '' : 'off'}"></span>`).join('');
  $('#pips').title = `${G.agentsLeft(S, 0)} negotiators free this quarter`;
  const idle = G.surplusTotal(S, 0);
  $('#nextSub').textContent = S.over ? 'game over' : idle ? `${idle} aircraft idle` : `to Q${(S.q + 1) % 4 + 1} ${S.q === 3 ? S.year + 1 : S.year}`;
  document.querySelectorAll('.tab').forEach(t => {
    t.setAttribute('aria-selected', t.dataset.tab === ui.tab);
    const n = t.dataset.tab === 'company' ? S.requests.length : t.dataset.tab === 'fleet' ? (idle ? 1 : 0) : 0;
    let b = t.querySelector('.badge');
    if (n && !b) { b = document.createElement('span'); b.className = 'badge'; t.appendChild(b); }
    if (b) { if (n) b.textContent = t.dataset.tab === 'fleet' ? '!' : n; else b.remove(); }
  });
  renderCoach();
}

// The coach is a five-step checklist that teaches the loop. Each step ticks itself off from the game state.
function tutSteps() {
  const A = ME(), t = S.tut;
  return [
    { done: G.routesOf(S, 0).length > 0, text: `Tap ${A.starters[0] || 'a city'} on the map, then Plan route.` },
    { done: S.turn > 0, text: 'Press End quarter to fly your schedule.' },
    { done: G.surplusTotal(S, 0) === 0 || G.routesOf(S, 0).length >= 3, text: 'Put your idle aircraft to work: open routes to the other cities where you hold slots.' },
    { done: !!t.plan || (A.planned || []).length > 0 || G.routesOf(S, 0).length >= 6, text: 'Find a new market in Routes › Opportunities and tap Plan for later.' },
    { done: !!t.slots || Object.keys(A.slots).length > A.starters.length + 1, text: 'Secure its slots first: send a negotiator from the Planned row.' },
    { done: !!t.buy || A.fleet.some(f => f.built >= S.era + 1 || f.built === S.year && S.turn > 0), text: 'Once the slots are won, buy or lease aircraft for it from the same row, then open it.' },
    { done: A.hubs.length > 1 || A.pending.some(p => p.kind === 'hub'), text: G.objectiveContext(S).hubsMatter ? `Build a hub in another region: your objective needs hubs in ${G.objectiveContext(S).hubsNeed} regions.` : `Build a second hub when its routes would pay back before the end of ${S.end - 1}: your objective is ${G.objectiveContext(S).name.toLowerCase()}.` },
  ];
}
function renderCoach() {
  const el = $('#coach');
  if (!S || S.tut.hide || ui.tab !== 'map' || ui.sheet) { el.hidden = true; return; }
  const steps = tutSteps();
  if (steps.every(s => s.done)) { S.tut.hide = true; el.hidden = true; toast(`Tutorial complete. Objective: ${G.objectiveContext(S).name}.`); return; }
  const now = steps.findIndex(s => !s.done);
  el.innerHTML = `<div class="row"><span class="lbl grow">Getting started · ${steps.filter(s => s.done).length}/${steps.length}</span><button data-act="tuthide" aria-label="Hide tutorial">Hide</button></div>
    <ol>${steps.map((s, k) => `<li class="${s.done ? 'done' : k === now ? 'now' : ''}"><i>${s.done ? '✓' : k === now ? '›' : '·'}</i>${esc(s.text)}</li>`).join('')}</ol>`;
  el.hidden = false;
}

function renderAll() {
  if (!S) return;
  document.body.dataset.tab = ui.tab;
  renderTop(); renderRegionBar(); renderPanel();
  if (ui.sheet) renderSheet(); else $('#sheet').hidden = true;
  draw();
}
function setTab(tab) {
  ui.tab = tab; ui.confirmNew = false;
  if (tab !== 'map') closeSheet(true);
  renderAll();
  if (tab !== 'map') $('#panel').scrollTop = 0;
}

// ---------- actions ----------
function act(btn) {
  const a = btn.dataset.act;
  const res = r => { if (!r.ok) { toast(r.err, 'err'); return false; } save(); return true; };
  switch (a) {
    case 'tab': closeModal(); setTab(btn.dataset.tab); break;
    case 'city': closeModal(); openCity(btn.dataset.c); break;
    case 'close': closeSheet(); break;
    case 'plan': openEditor(btn.dataset.from, ui.sel); break;
    case 'slotn': ui.slotN = +btn.dataset.n; renderSheet(); break;
    case 'slots': if (res(G.negotiateSlots(S, 0, ui.sel, ui.slotN))) { S.tut.slots = 1; sfx('ok'); toast(`Negotiator sent to ${CITY[ui.sel].name}.`); renderSheet(); renderTop(); } break;
    case 'hub': if (res(G.buildHub(S, 0, ui.sel))) { sfx('ok'); toast(`Hub construction started in ${CITY[ui.sel].name}.`); renderSheet(); renderTop(); } break;
    case 'buybiz': if (res(G.buyBusiness(S, 0, ui.sel, btn.dataset.t))) { sfx('coin'); toast(`You bought a ${BUSINESSES[btn.dataset.t].name} in ${CITY[ui.sel].name}.`); renderSheet(); renderTop(); draw(); } break;
    case 'sellbiz': if (res(G.sellBusiness(S, 0, ui.sel, btn.dataset.t))) { toast(`Sold your ${BUSINESSES[btn.dataset.t].name}.`); renderSheet(); renderTop(); draw(); } break;
    case 'req': {
      const id = +btn.dataset.id, yes = btn.dataset.yes === '1', q = S.requests.find(x => x.id === id);
      if (q && res(G.answerRequest(S, id, yes))) {
        sfx(yes ? 'ok' : 'buzz');
        toast(yes ? `${CITY[q.city].name} is grateful.` : `${CITY[q.city].name} is disappointed. Relations −6.`);
        if (!$('#modal').hidden && ui.inQuarter) showQuarter(ui.lastRep);
        renderAll();
      }
      break;
    }
    case 'advice': {
      const k = btn.dataset.k, v = btn.dataset.v;
      ui.queue = ui.queue.filter(x => x === 'over'); closeModal();
      if (k === 'route') openEditor(null, null, +v);
      else if (k === 'city') openCity(v);
      else if (k === 'plan') { const [x, y] = v.split('-'); setTab('map'); openEditor(x, y); }
      else setTab(v);
      if (ui.queue.length) nextInQueue();
      break;
    }
    case 'origin': ui.ed.a = btn.dataset.o; fitEditorType(); resuggest('origin'); renderSheet(); draw(); break;
    case 'type': ui.ed.type = btn.dataset.t; resuggest('type'); renderSheet(); break;
    case 'suggest': resuggest('auto'); toast(`Suggested: ${ui.ed.freq} flights a week on ${ui.ed.planes} aircraft.`); renderSheet(); break;
    case 'pl-': ui.ed.planes--; ui.ed.sugg = null; clampEditor(); renderSheet(); break;
    case 'pl+': ui.ed.planes++; ui.ed.sugg = null; { const L = limits(); if (ui.ed.freq < L.max) ui.ed.freq = Math.min(L.max, ui.ed.freq + Math.max(1, Math.floor(L.byPlanes / ui.ed.planes))); } clampEditor(); renderSheet(); break;
    case 'fq-': ui.ed.freq--; ui.ed.sugg = null; renderSheet(); break;
    case 'fq+': ui.ed.freq++; ui.ed.sugg = null; renderSheet(); break;
    case 'addplan': { const a = btn.dataset.a, b = btn.dataset.b; if (res(G.addPlanned(S, 0, a, b))) { S.tut.plan = 1; sfx('ok'); toast(`${a}–${b} added to your planned routes (Routes › Planned).`); planCache.k = ''; if (ui.sheet) renderSheet(); renderAll(); } break; }
    case 'rmplan': G.removePlanned(S, 0, btn.dataset.a, btn.dataset.b); save(); planCache.k = ''; renderAll(); break;
    case 'planopen': { const a = btn.dataset.a, b = btn.dataset.b; openEditor(a, b); break; }
    case 'planbuy': { const t = btn.dataset.t, n = +btn.dataset.n, lease = btn.dataset.lease === '1';
      if (res(lease ? G.leasePlanes(S, 0, t, n) : G.buyPlanes(S, 0, t, n))) { S.tut.buy = 1; sfx('coin'); toast(`${lease ? 'Leased' : 'Ordered'} ${n} × ${PLANE[t].name} for ${btn.dataset.a}–${btn.dataset.b}. Delivery next quarter.`); planCache.k = ''; renderAll(); }
      break; }
    case 'planslots': { const c = btn.dataset.c, n = +btn.dataset.n;
      if (res(G.negotiateSlots(S, 0, c, n))) { S.tut.slots = 1; sfx('ok'); toast(`Negotiator sent to ${CITY[c].name} for ${n} slots. Results at the end of the quarter.`); planCache.k = ''; renderAll(); }
      break; }
    case 'fincast': closeModal(); ui.queue = ui.queue.filter(x => x === 'over'); ui.cview = 'finance'; setTab('company'); if (ui.queue.length) nextInQueue(); break;
    case 'decide': {
      const id = +btn.dataset.id, spec = JSON.parse(btn.dataset.spec);
      closeModal(); ui.queue = ui.queue.filter(x => x === 'over');
      openEditor(null, null, id); Object.assign(ui.ed, spec); ui.ed.sugg = null; ui.advice = { id, loaded: true, res: null };
      toast('Change loaded into the planner. Check the forecast, then Save changes.'); renderSheet();
      if (ui.queue.length) nextInQueue();
      break;
    }
    case 'decbuy': { const t = btn.dataset.t, n = +btn.dataset.n; if (res(G.buyPlanes(S, 0, t, n))) { S.tut.buy = 1; sfx('coin'); toast(`Ordered ${n} × ${PLANE[t].name}. Delivery next quarter.`); decCache.k = -1; if (ui.inQuarter) showQuarter(ui.lastRep); renderAll(); } break; }
    case 'decslots': { const c = btn.dataset.c, n = +btn.dataset.n; if (res(G.negotiateSlots(S, 0, c, n))) { S.tut.slots = 1; sfx('ok'); toast(`Negotiator sent to ${CITY[c].name} for ${n} slots.`); decCache.k = -1; if (ui.inQuarter) showQuarter(ui.lastRep); renderAll(); } break; }
    case 'autocheck': ME().autoCheck = !ME().autoCheck; save(); toast(ME().autoCheck ? 'Heavy checks will be booked automatically when due, if cash allows.' : 'Automatic heavy checks off.'); renderPanel(); break;
    case 'rtview': ui.rtview = btn.dataset.v; renderPanel(); break;
    case 'dr': {
      const id = +btn.dataset.id, k = btn.dataset.k, v = +btn.dataset.v, r = S.routes.find(x => x.id === id);
      const d = (ui.rdraft ||= {})[id] ||= { freq: r.freq, fare: r.fare };
      if (k === 'freq') d.freq = Math.max(1, d.freq + v); else d.fare = G.clamp(d.fare + v, -50, 50);
      if (d.freq === r.freq && d.fare === r.fare) delete ui.rdraft[id];
      renderPanel(); break;
    }
    case 'drclear': ui.rdraft = {}; renderPanel(); break;
    case 'drapply': {
      const ids = Object.keys(ui.rdraft || {}).map(Number), fails = [];
      // cuts first, so slots they free can be used by increases in the same batch
      ids.sort((x, y) => (ui.rdraft[x].freq - S.routes.find(r => r.id === x).freq) - (ui.rdraft[y].freq - S.routes.find(r => r.id === y).freq));
      for (const id of ids) { const r = S.routes.find(x => x.id === id), d = ui.rdraft[id]; const out = G.updateRoute(S, id, { ...r, freq: d.freq, fare: d.fare }); if (out.ok) delete ui.rdraft[id]; else fails.push(`${r.a}–${r.b}: ${out.err}`); }
      save(); sfx(fails.length ? 'buzz' : 'ok'); toast(fails.length ? `Some changes could not be made. ${fails[0]}` : 'All changes applied.', fails.length ? 'err' : undefined); renderAll(); break;
    }
    case 'music': prefs.music = prefs.music === false; savePrefs(); if (prefs.music) musicStart(true); else musicStop(); syncMusicBtn(); if (ui.tab === 'company') renderPanel(); break;
    case 'openroute': {
      const ed = ui.ed;
      if (res(G.openRoute(S, 0, ed))) { sfx('jet'); toast(`${ed.a} ⇄ ${ed.b} opened. Results come in at the end of the quarter.`); closeSheet(); renderAll(); }
      break;
    }
    case 'saveroute': if (res(G.updateRoute(S, ui.ed.id, ui.ed))) { sfx('ok'); toast('Route updated.'); closeSheet(); renderAll(); } break;
    case 'closeroute':
      if (!ui.confirmClose) { ui.confirmClose = true; renderSheet(); break; }
      G.closeRoute(S, ui.ed.id); save(); toast('Route closed. Its aircraft and slots are free again.'); closeSheet(); renderAll(); break;
    case 'editroute': openEditor(null, null, +btn.dataset.id); break;
    case 'q-': ui.buyQty[btn.dataset.t] = Math.max(1, (ui.buyQty[btn.dataset.t] || 1) - 1); renderPanel(); break;
    case 'q+': ui.buyQty[btn.dataset.t] = Math.min(10, (ui.buyQty[btn.dataset.t] || 1) + 1); renderPanel(); break;
    case 'buy': { const t = btn.dataset.t, n = ui.buyQty[t] || 1; if (res(G.buyPlanes(S, 0, t, n))) { S.tut.buy = 1; sfx('coin'); toast(`Ordered ${n} × ${PLANE[t].name}. Delivery next quarter.`); ui.buyQty[t] = 1; renderAll(); } break; }
    case 'sell': { const t = btn.dataset.t, r = G.sellPlanes(S, 0, t, 1); if (res(r)) { sfx('coin'); toast(`Sold one ${PLANE[t].name} for ${money(r.value)}.`); renderAll(); } break; }
    case 'adreg': ui.adRegion = btn.dataset.r; renderPanel(); break;
    case 'adtier': ui.adTier = +btn.dataset.i; renderPanel(); break;
    case 'ad': if (res(G.adCampaign(S, 0, ui.adRegion, ui.adTier))) { sfx('ok'); toast(`Campaign running in ${REGION[ui.adRegion].name}.`); renderAll(); } break;
    case 'mute': prefs.mute = !prefs.mute; savePrefs(); renderPanel(); if (!prefs.mute) sfx('ok'); break;
    case 'tuthide': S.tut.hide = true; save(); renderCoach(); break;
    case 'tutreset': S.tut = {}; save(); setTab('map'); break;
    case 'newgame':
      if (!ui.confirmNew) { ui.confirmNew = true; renderPanel(); break; }
      ui.confirmNew = false; clearSave(); S = null; closeSheet(true); showStart(); break;
    case 'continue': nextInQueue(); break;
    case 'findr': ui.findR = btn.dataset.r; renderSheet(); break;
    case 'urgent': prefs.urgentOnly = !prefs.urgentOnly; savePrefs(); showQuarter(ui.lastRep); break;
    case 'focus': ME().focus = btn.dataset.v; ui.advice = null; save(); if (ui.inQuarter) showQuarter(ui.lastRep); else renderPanel(); break;
    case 'crisis': {
      const r = G.resolveCrisis(S, btn.dataset.k);
      if (res(r)) { sfx('ok'); toast(`Decision made: ${r.label}.`); renderAll(); if (ui.lastRep) showQuarter(ui.lastRep); else { closeModal(); ui.inQuarter = false; } }
      break;
    }
    case 'mode': ui.start.scenario = btn.dataset.v === 'scenario' ? (ui.start.scenario || G.SCENARIOS[0].id) : null; showStart(); break;
    case 'scen': ui.start.scenario = btn.dataset.s; showStart(); break;
    case 'goal': ui.start.goal = btn.dataset.g; showStart(); break;
    case 'sub': ui[btn.dataset.k] = btn.dataset.v; renderPanel(); $('#panel').scrollTop = 0; break;
    case 'svc': ui.ed.svc = +btn.dataset.v; renderSheet(); break;
    case 'cab': ui.ed.cab = +btn.dataset.v; renderSheet(); break;
    case 'peak': ui.ed.peak = !ui.ed.peak; renderSheet(); break;
    case 'rsort': ui.rsort = btn.dataset.v; renderPanel(); break;
    case 'snooze': S.snooze = S.snooze || {}; S.snooze[btn.dataset.k] = S.turn + 4; save(); toast('Hidden for four quarters.'); showQuarter(ui.lastRep); break;
    case 'check': { const t = btn.dataset.t, r = G.heavyCheck(S, 0, t); if (res(r)) { sfx('ok'); toast(`Heavy check booked for the ${PLANE[t].name} fleet: ${money(r.cost)} with this quarter's costs.`); renderAll(); } break; }
    case 'convert': { const t = btn.dataset.t, r = G.convertFreighter(S, 0, t); if (res(r)) { sfx('coin'); toast(`One ${PLANE[t].name} converted to a freighter for ${money(r.cost)}. It earns from next quarter.`); renderAll(); } break; }
    case 'dividend': { const n = +btn.dataset.n, r = G.payDividend(S, n); if (res(r)) { sfx('coin'); toast(`Paid a ${money(n)} dividend. Board confidence +${r.gain}.`); renderAll(); } break; }
    case 'buypeak': { const n = +btn.dataset.n; if (res(G.buyPeak(S, 0, ui.sel, n))) { sfx('coin'); toast(`${n} slots at ${ui.sel} upgraded to peak times.`); renderSheet(); renderTop(); } break; }
    case 'buyslots': { const j = +btn.dataset.j, n = +btn.dataset.n, r = G.buySlotsFrom(S, 0, j, ui.sel, n); if (res(r)) { sfx('coin'); toast(`Bought ${n} slots at ${ui.sel} from ${S.airlines[j].name} for ${money(r.cost)}.`); renderSheet(); renderTop(); } break; }
    case 'rstat': ui.rstat = btn.dataset.v; renderSheet(); break;
    case 'advise': {
      const id = ui.ed.id;
      btn.disabled = true; btn.textContent = 'Running the numbers…';
      setTimeout(() => { ui.advice = { id, res: G.routeAdvice(S, id) }; sfx('ok'); renderSheet(); }, 30);
      break;
    }
    case 'applyadvice': {
      const b = ui.advice.res.best;
      // load the advice into the planner; nothing is committed until Save changes
      Object.assign(ui.ed, b); ui.advice.loaded = true;
      toast('Advice loaded into the planner. Press Save changes to apply it.');
      renderSheet(); $('#sheet').scrollTop = 0;
      break;
    }
    case 'retslots': { const r = G.returnSlots(S, 0, btn.dataset.c, +btn.dataset.n); if (res(r)) { toast(`Returned ${btn.dataset.n} slots at ${btn.dataset.c} for ${money(r.refund)}.`); renderAll(); } break; }
    case 'heat': ui.heat = !ui.heat; $('#zheat').setAttribute('aria-pressed', ui.heat); if (ui.heat) setTab('map'); else renderPanel(); break;
    case 'planpair': openEditor(btn.dataset.a, btn.dataset.b); break;
    case 'ff': { const k = btn.dataset.k, v = btn.dataset.v; ui.ff[k] = k === 'afford' ? v === 'true' : v; renderPanel(); break; }
    case 'cmp': { const id = btn.dataset.t; ui.cmp = ui.cmp || []; ui.cmp = ui.cmp.includes(id) ? ui.cmp.filter(x => x !== id) : [...ui.cmp, id].slice(-3); renderPanel(); break; }
    case 'cmpclear': ui.cmp = []; renderPanel(); break;
    case 'lease': { const t = btn.dataset.t, n = ui.buyQty[t] || 1; if (res(G.leasePlanes(S, 0, t, n))) { S.tut.buy = 1; sfx('coin'); toast(`Leased ${n} × ${PLANE[t].name}. Delivery next quarter.`); ui.buyQty[t] = 1; renderAll(); } break; }
    case 'retlease': { const t = btn.dataset.t, r = G.returnLease(S, 0, t, 1); if (res(r)) { toast(`Returned one leased ${PLANE[t].name}: deposit back ${money(r.refund)}${r.fee >= 0.05 ? `, early-return fee ${money(r.fee)}` : ''}.`); renderAll(); } break; }
    case 'sandbox': S.over = null; S.sandbox = true; save(); closeModal(); ui.queue = []; toast('Sandbox: keep flying until the campaign ends. No more wins or losses by objective.'); renderAll(); break;
    case 'metric': ui.metric = btn.dataset.v; renderPanel(); break;
    case 'codeshare': { const r = G.proposeCodeshare(S, +btn.dataset.i); if (res(r)) { sfx(r.yes ? 'fanfare' : 'buzz'); toast(r.text); renderAll(); } break; }
    case 'buyroute': { const r = G.buyRoute(S, +btn.dataset.id); if (res(r)) { sfx('coin'); toast(r.text); renderAll(); } break; }
    case 'takeover': {
      const j = +btn.dataset.i;
      if (ui.confirmTake !== j) { ui.confirmTake = j; renderPanel(); break; }
      ui.confirmTake = null;
      const r = G.takeover(S, j);
      if (res(r)) { sfx('fanfare'); toast(r.text); renderAll(); }
      break;
    }
    case 'loanamt': ui.loanAmt = +btn.dataset.n; renderPanel(); break;
    case 'borrow': { const r = G.borrow(S, 0, ui.loanAmt || 25); if (res(r)) { sfx('coin'); toast(`Borrowed ${money(ui.loanAmt || 25, 0)} at ${(r.rate * 100).toFixed(1)}% a quarter.`); renderAll(); } break; }
    case 'repay': if (res(G.repay(S, 0, Math.min(ui.loanAmt || 25, ME().debt)))) { sfx('ok'); toast('Loan repaid.'); renderAll(); } break;
    case 'hedge': { const r = G.hedgeFuel(S, 0); if (res(r)) { sfx('ok'); toast(`Fuel locked at today's price for a year.`); renderAll(); } break; }
    case 'era': ui.start.era = +btn.dataset.e; showStart(); break;
    case 'home': ui.start.home = btn.dataset.c; showStart(); break;
    case 'face': ui.start.face = +btn.dataset.f; showStart(); break;
    case 'diff': ui.start.diff = +btn.dataset.d; showStart(); break;
    case 'start': startGame(); break;
    case 'resume': S = loadSave(); closeModal(); afterLoad(); break;
    case 'restart': clearSave(); S = null; showStart(); break;
  }
}
// planner: show an aircraft's details while hovering its tile, and the chosen one otherwise
document.addEventListener('mouseover', e => {
  const t = e.target.closest && e.target.closest('#sheet .tile[data-t]'), box = $('#tileinfo');
  if (t && box && box.dataset.t !== t.dataset.t) { box.innerHTML = planeInfo(t.dataset.t); box.dataset.t = t.dataset.t; }
});
document.addEventListener('mouseout', e => {
  const tiles = e.target.closest && e.target.closest('#sheet .tiles'), box = $('#tileinfo');
  if (tiles && box && ui.ed && !tiles.contains(e.relatedTarget) && box.dataset.t !== ui.ed.type) { box.innerHTML = planeInfo(ui.ed.type); box.dataset.t = ui.ed.type; }
});
// music starts on the first tap, as browsers require
document.addEventListener('pointerdown', () => { if (prefs.music !== false) musicStart(); }, { once: true });
document.addEventListener('visibilitychange', () => musicPause(document.hidden));
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) act(b);
  const t = e.target.closest('.tab');
  if (t && S) setTab(t.dataset.tab);
});
document.addEventListener('input', e => {
  if (e.target.id === 'findq') { ui.findQ = e.target.value; $('#findlist').innerHTML = finderList(); return; }
  if (e.target.id === 'fare' && ui.ed) {
    ui.ed.fare = +e.target.value;
    $('#fareVal').innerHTML = fareText();
    $('#fc').innerHTML = forecastHtml();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'ffroute') { ui.ff.route = e.target.value; renderPanel(); }
});
document.addEventListener('toggle', e => {
  const d = e.target.closest && e.target.closest('details[data-deal]');
  if (d) ui.dealOpen = d.open ? +d.dataset.deal : (ui.dealOpen === +d.dataset.deal ? null : ui.dealOpen);
}, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal').hidden && ui.sheet) closeSheet();
});

$('#next').addEventListener('click', () => {
  if (!S || S.over) return;
  closeSheet(true);
  const rep = G.endQuarter(S);
  ui.lastRep = rep;
  save();
  renderAll();
  ui.queue = ['quarter'];
  if (S.over) ui.queue.push('over');
  nextInQueue();
});

// ---------- boot ----------
window.addEventListener('resize', () => { resize(); draw(); });
function start(data) {
  resize();
  if (data && data.S) {
    S = data.S; Object.assign(ui, data.ui || {});
    renderAll(); centerOn(ME().home, Math.max(minZ(), W / 100));
  } else {
    const saved = loadSave();
    if (saved && !saved.over) { S = saved; afterLoad(); }
    else showStart();
  }
  requestAnimationFrame(loop);
}
window.contrailDebug = { get S() { return S; }, set S(v) { S = v; }, ui, view, onCityTap, act, renderAll, G };
window.claude?.hot?.snapshot?.(() => ({ S, ui: { tab: ui.tab, start: ui.start } }));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
