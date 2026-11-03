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
  $('#pips').innerHTML = Array.from({ length: G.AGENTS }, (_, k) => `<span class="pip ${k < G.agentsLeft(S, 0) ? '' : 'off'}"></span>`).join('');
  $('#pips').title = `${G.agentsLeft(S, 0)} negotiators free this quarter`;
  const idle = G.idleTotal(S, 0);
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
    { done: !!t.slots || Object.keys(A.slots).length > A.starters.length + 1, text: 'Tap a big city and send a negotiator for slots.' },
    { done: !!t.buy || A.fleet.some(f => f.built >= S.era + 1 || f.built === S.year && S.turn > 0), text: 'Buy more aircraft in Fleet.' },
    { done: A.hubs.length > 1 || A.pending.some(p => p.kind === 'hub'), text: 'Build a hub in another region to reach it all.' },
  ];
}
function renderCoach() {
  const el = $('#coach');
  if (!S || S.tut.hide || ui.tab !== 'map' || ui.sheet) { el.hidden = true; return; }
  const steps = tutSteps();
  if (steps.every(s => s.done)) { S.tut.hide = true; el.hidden = true; toast('Tutorial complete. The world is yours to win.'); return; }
  const now = steps.findIndex(s => !s.done);
  el.innerHTML = `<div class="row"><span class="lbl grow">Getting started · ${steps.filter(s => s.done).length}/${steps.length}</span><button data-act="tuthide" aria-label="Hide tutorial">Hide</button></div>
    <ol>${steps.map((s, k) => `<li class="${s.done ? 'done' : k === now ? 'now' : ''}"><i>${s.done ? '✓' : k === now ? '›' : '·'}</i>${esc(s.text)}</li>`).join('')}</ol>`;
  el.hidden = false;
}

function renderAll() {
  if (!S) return;
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
        if (!$('#modal').hidden && ui.queue.length === 0 && $('#modal [data-act=continue]')) showMeeting();
        renderAll();
      }
      break;
    }
    case 'advice': {
      const k = btn.dataset.k, v = btn.dataset.v;
      ui.queue = ui.queue.filter(x => x === 'over'); closeModal();
      if (k === 'route') openEditor(null, null, +v);
      else if (k === 'city') openCity(v);
      else setTab(v);
      if (ui.queue.length) nextInQueue();
      break;
    }
    case 'origin': ui.ed.a = btn.dataset.o; fitEditorType(); renderSheet(); draw(); break;
    case 'type': ui.ed.type = btn.dataset.t; ui.ed.planes = 1; clampEditor(); renderSheet(); break;
    case 'pl-': ui.ed.planes--; clampEditor(); renderSheet(); break;
    case 'pl+': ui.ed.planes++; { const L = limits(); if (ui.ed.freq < L.max) ui.ed.freq = Math.min(L.max, ui.ed.freq + Math.max(1, Math.floor(L.byPlanes / ui.ed.planes))); } clampEditor(); renderSheet(); break;
    case 'fq-': ui.ed.freq--; renderSheet(); break;
    case 'fq+': ui.ed.freq++; renderSheet(); break;
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
    case 'sub': ui[btn.dataset.k] = btn.dataset.v; renderPanel(); $('#panel').scrollTop = 0; break;
    case 'svc': ui.ed.svc = +btn.dataset.v; renderSheet(); break;
    case 'rstat': ui.rstat = btn.dataset.v; renderSheet(); break;
    case 'advise': {
      const id = ui.ed.id;
      btn.disabled = true; btn.textContent = 'Running the numbers…';
      setTimeout(() => { ui.advice = { id, res: G.routeAdvice(S, id) }; sfx('ok'); renderSheet(); }, 30);
      break;
    }
    case 'applyadvice': {
      const b = ui.advice.res.best;
      if (res(G.updateRoute(S, ui.ed.id, b))) { sfx('ok'); toast('Advice applied. Results show at the end of the quarter.'); Object.assign(ui.ed, b); ui.advice = null; renderSheet(); renderTop(); draw(); }
      break;
    }
    case 'retslots': { const r = G.returnSlots(S, 0, btn.dataset.c, +btn.dataset.n); if (res(r)) { toast(`Returned ${btn.dataset.n} slots at ${btn.dataset.c} for ${money(r.refund)}.`); renderAll(); } break; }
    case 'heat': ui.heat = !ui.heat; $('#zheat').setAttribute('aria-pressed', ui.heat); if (ui.heat) setTab('map'); else renderPanel(); break;
    case 'planpair': openEditor(btn.dataset.a, btn.dataset.b); break;
    case 'ff': { const k = btn.dataset.k, v = btn.dataset.v; ui.ff[k] = k === 'afford' ? v === 'true' : v; renderPanel(); break; }
    case 'cmp': { const id = btn.dataset.t; ui.cmp = ui.cmp || []; ui.cmp = ui.cmp.includes(id) ? ui.cmp.filter(x => x !== id) : [...ui.cmp, id].slice(-3); renderPanel(); break; }
    case 'cmpclear': ui.cmp = []; renderPanel(); break;
    case 'lease': { const t = btn.dataset.t, n = ui.buyQty[t] || 1; if (res(G.leasePlanes(S, 0, t, n))) { S.tut.buy = 1; sfx('coin'); toast(`Leased ${n} × ${PLANE[t].name}. Delivery next quarter.`); ui.buyQty[t] = 1; renderAll(); } break; }
    case 'retlease': { const t = btn.dataset.t; if (res(G.returnLease(S, 0, t, 1))) { toast(`Returned one leased ${PLANE[t].name}.`); renderAll(); } break; }
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
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) act(b);
  const t = e.target.closest('.tab');
  if (t && S) setTab(t.dataset.tab);
});
document.addEventListener('input', e => {
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
  ui.queue = ['report'];
  if (rep.scores && rep.scores[0]) ui.queue.push('score');
  if (rep.yearEnd) ui.queue.push('ceremony');
  if (S.over) ui.queue.push('over');
  else if (S.meeting.length || S.requests.length) ui.queue.push('meeting');
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
