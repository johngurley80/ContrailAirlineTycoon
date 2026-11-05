// Rival airlines. Each has a personality that shapes fares, aircraft, expansion and how it fights you.
(function (G) {
  'use strict';
  const { CITY, CITIES, PLANE, REGIONS } = G;

  function candidates(s, i) {
    const A = s.airlines[i], P = G.PERSONALITIES[A.pers];
    const out = [];
    const hubRegions = new Set(A.hubs.map(h => CITY[h].region));
    for (const hub of A.hubs) {
      const spokes = G.routesOf(s, i).filter(r => r.a === hub || r.b === hub).map(r => (r.a === hub ? r.b : r.a));
      for (const c of CITIES) {
        if (G.routeBlock(s, i, hub, c.code)) continue;
        const d = G.dist(hub, c.code);
        if (d > 15000 || d < 200) continue;
        if (P.maxShort && d > P.maxShort && A.cash < 800 && !(c.major && !hubRegions.has(c.region))) continue;
        let v = G.baseDemand(s, hub, c.code) * G.baseFare(s, d);
        for (const x of spokes) {
          if (x === c.code) continue;
          const dx = G.dist(x, c.code);
          if ((G.dist(x, hub) + d) / dx < 1.6) v += 0.2 * G.baseDemand(s, x, c.code) * G.baseFare(s, dx);
        }
        const comp = s.routes.filter(r => r.o !== i && G.pairKey(r.a, r.b) === G.pairKey(hub, c.code)).length;
        v /= 1 + comp * 0.7;
        if (c.major && !hubRegions.has(c.region)) v *= 1.6;
        out.push({ hub, c: c.code, d, score: v * (0.85 + G.rnd(s) * 0.3) });
      }
    }
    return out.sort((x, y) => y.score - x.score);
  }

  function pickType(s, i, d, demand, fromIdle) {
    const A = s.airlines[i], P = G.PERSONALITIES[A.pers];
    const pool = (fromIdle ? G.fleetTypes(A).filter(t => G.idle(s, i, t) > 0) : G.buyableTypes(s, i).map(p => p.id))
      .map(t => PLANE[t]).filter(p => p.range >= d && (fromIdle || G.planePrice(s, i, p.id) < A.cash - 20));
    if (!pool.length) return null;
    const want = demand * 0.45 / 7;
    const big = G.rnd(s) < P.big;
    pool.sort((x, y) => {
      if (big) return y.seats * y.comfort - x.seats * x.comfort;
      return Math.abs(x.seats - want) / x.seats + x.hourly / x.seats - (Math.abs(y.seats - want) / y.seats + y.hourly / y.seats);
    });
    return pool[0];
  }

  function tryOpen(s, i, hub, c, fare) {
    const d = G.dist(hub, c);
    const T = pickType(s, i, d, G.baseDemand(s, hub, c), true);
    if (!T) return false;
    const want = G.clamp(Math.round(G.baseDemand(s, hub, c) * 0.45 / T.seats), 2, 21);
    const planes = Math.min(G.idle(s, i, T.id), Math.max(1, Math.ceil(want * G.rtHours(T.id, d) / G.HOURS_PER_PLANE)));
    const freq = Math.min(want, G.maxFreq(T.id, planes, d), G.slotsAvail(s, i, hub), G.slotsAvail(s, i, c));
    if (freq < 2) return false;
    return G.openRoute(s, i, { a: hub, b: c, type: T.id, planes, freq, fare: G.clamp(fare, -50, 50) }).ok;
  }

  // A challenger with no spare aircraft for the route buys one or two that can fly it.
  function buyFor(s, i, a, b) {
    const A = s.airlines[i], d = G.dist(a, b);
    if (A.orders.length || A.cash < 120) return false;
    const T = pickType(s, i, d, G.baseDemand(s, a, b), false);
    if (!T) return false;
    G.buyPlanes(s, i, T.id, 2);
    return false; // aircraft arrive at quarter end; the route opens next quarter
  }

  function wantSlots(s, i, c, n = 10) {
    const A = s.airlines[i];
    if (G.agentsLeft(s, i) <= 0 || G.slotBlock(s, i, c)) return;
    const unused = Object.keys(A.slots).filter(x => !A.hubs.includes(x)).reduce((t, x) => t + Math.max(0, G.slotsAvail(s, i, x)), 0);
    if (unused > (A.cash > 500 ? 60 : 24) && !A.hubs.includes(c)) return;
    if (G.slotsAvail(s, i, c) >= 6 || G.airportFree(s, c) < 4) return;
    if (A.cash < G.slotPrice(s, c) * n + 25) return;
    G.negotiateSlots(s, i, c, n);
  }

  // Player routes whose margins advertise themselves: uncontested, priced high and clearly profitable.
  G.exposedRoutes = function (s) {
    return G.routesOf(s, 0).filter(r => r.last && r.age >= 2 && r.last.rev > 0 && !s.routes.some(x => x.o !== 0 && G.pairKey(x.a, x.b) === G.pairKey(r.a, r.b)))
      .map(r => {
        const m = r.last.profit / r.last.rev;
        const lure = G.clamp((m - 0.18) * 1.6 + Math.max(0, r.fare - 10) / 80, 0, 0.8);
        return { r, m, lure };
      }).filter(x => x.lure > 0.05).sort((x, y) => y.lure * y.r.last.profit - x.lure * x.r.last.profit);
  };

  G.aiTurn = function (s, i, rep) {
    const A = s.airlines[i];
    if (A.bankrupt) return;
    const P = G.PERSONALITIES[A.pers];
    const say = (kind, text, x) => rep.rivals.push({ i, kind, text, ...x });
    const player = s.airlines[0];
    // in a race for value, sharper rivals stop spending on things that cannot pay back before the finish
    const endgame = s.goal === 'value' && s.difficulty >= 5 && G.quartersLeft(s) <= (s.difficulty >= 6 ? 6 : 4);

    // 1. tune fares and prune losers; in a cash crunch, stop discounting and shed dead weight
    const crunch = A.cash < 25;
    for (const r of G.routesOf(s, i)) {
      if (!r.last) continue;
      if (r.last.spill > r.last.pax * 0.15 && r.fare < P.fare + 30) r.fare = Math.min(P.fare + 30, r.fare + 10);
      else if (r.last.lf > 0.93 && r.fare < P.fare + 30) r.fare += 5;
      else if (r.last.lf < 0.6 && r.fare > P.fare - 30 && !crunch) r.fare -= 5;
      if (crunch && r.fare < 0) r.fare += 5;
      r.losses = r.last.profit < 0 ? (r.losses || 0) + 1 : 0;
      if ((r.losses >= 3 && r.age >= 4) || (crunch && r.losses >= 1 && r.age >= 2)) G.closeRoute(s, r.id);
    }
    if (crunch) {
      for (const t of G.fleetTypes(A)) if (G.idle(s, i, t) > 0) G.sellPlanes(s, i, t, G.idle(s, i, t));
      if (A.cash < 0) {
        const worst = G.routesOf(s, i).filter(r => r.last).sort((x, y) => (x.last.profit - G.PLANE[x.type].price * G.OWN_RATE * x.planes) - (y.last.profit - G.PLANE[y.type].price * G.OWN_RATE * y.planes))[0];
        if (worst && worst.last.profit < G.PLANE[worst.type].price * G.OWN_RATE * worst.planes) {
          G.closeRoute(s, worst.id);
          G.sellPlanes(s, i, worst.type, Math.min(worst.planes, G.idle(s, i, worst.type)));
        }
      }
      A.intent = { kind: 'save', text: 'Short of cash: cutting back, no new routes.' };
      return;
    }

    // 1b. a proper review of two routes a quarter, kept within the personality's fare range
    const review = G.routesOf(s, i).filter(r => r.last && r.age >= 1).sort((x, y) => ((x.id + s.turn) % 5) - ((y.id + s.turn) % 5)).slice(0, 2);
    for (const r of review) {
      const adv = G.routeAdvice(s, r.id, true);
      if (adv && adv.gain > 0.3) G.updateRoute(s, r.id, { ...adv.best, fare: G.clamp(adv.best.fare, P.fare - 30, P.fare + 30) });
    }

    // 2. answer the player's moves on shared routes, in kind
    const friend = G.allied(s, i);
    for (const ev of s.log.filter(e => e.i === 0 && !friend)) {
      const mine = s.routes.find(r => r.o === i && G.pairKey(r.a, r.b) === G.pairKey(ev.a, ev.b));
      if (!mine) continue;
      const pr = `${mine.a}–${mine.b}`, pct = f => `${f >= 0 ? '+' : ''}${f}%`;
      if (ev.fare < mine.fare - 2) {
        if (G.rnd(s) > P.attack + 0.25) { say('hold', `${A.name} holds its ${pr} fare at ${pct(mine.fare)} despite your ${pct(ev.fare)}.`, { a: mine.a, b: mine.b }); continue; }
        const nf = G.clamp(ev.fare + Math.round(P.cut / 2), -50, 50);
        if (nf < mine.fare) {
          mine.fare = nf;
          say('war', `${A.name} answers your ${pct(ev.fare)} on ${pr} by cutting to ${pct(nf)}. “${G.fill(G.pick(s, P.retort), { player: player.name })}”`, { a: mine.a, b: mine.b });
        }
      } else if (ev.fare > mine.fare + 8) {
        if (G.rnd(s) < 0.5) {
          const nf = Math.min(ev.fare - 5, mine.fare + 10);
          mine.fare = nf;
          say('follow', `${A.name} follows your fare rise on ${pr} to ${pct(nf)}, staying just under you.`, { a: mine.a, b: mine.b });
        } else say('hold', `${A.name} keeps ${pr} at ${pct(mine.fare)}, hoping to win passengers from your ${pct(ev.fare)} fare.`, { a: mine.a, b: mine.b });
      }
    }

    // 3. carry out last quarter's announced attack on one of the player's routes
    const plan = A.intent;
    A.intent = null;
    if (plan && plan.kind === 'attack' && !player.bankrupt && !friend) {
      const t = s.routes.find(r => r.o === 0 && G.pairKey(r.a, r.b) === G.pairKey(plan.a, plan.b));
      if (plan.permit) { A.permits ||= []; if (!A.permits.includes(G.pairKey(plan.a, plan.b))) A.permits.push(G.pairKey(plan.a, plan.b)); }
      if (!t) say('hold', `${A.name} called off its ${plan.a}–${plan.b} launch after you left the route.`);
      else if (!G.routeBlock(s, i, plan.hub, plan.other)) {
        const fare = G.clamp(Math.min(plan.fare, t.fare + P.cut), -50, 50);
        // regulators release a few slots to a new entrant on a route only one airline flies
        const alone = !s.routes.some(r => r.o !== 0 && G.pairKey(r.a, r.b) === G.pairKey(t.a, t.b));
        if (alone) for (const c of [plan.hub, plan.other]) {
          const short = Math.min(8, Math.max(0, Math.min(t.freq, 7) - G.slotsAvail(s, i, c)));
          if (short > 0 && A.cash > G.slotPrice(s, c) * short + 20) { G.pay(A, -G.slotPrice(s, c) * short, 'slots'); A.slots[c] = (A.slots[c] || 0) + short; s.cap[c] += short; plan.freed = true; }
        }
        if (tryOpen(s, i, plan.hub, plan.other, fare) || (plan.permit && buyFor(s, i, plan.hub, plan.other) && tryOpen(s, i, plan.hub, plan.other, fare)))
          say('attack', `${A.name} launches ${t.a}–${t.b} against you at ${fare >= 0 ? '+' : ''}${fare}%${plan.permit ? ', drawn by your fat margins there' : ''}. “${G.fill(G.pick(s, P.taunts), { player: player.name, route: `${t.a}–${t.b}`, region: '' })}”`, { a: t.a, b: t.b });
        else {
          // An announced launch moves through clear steps (secure slots, get aircraft, launch) and gives up
          // after a bounded wait, saying why, so a threat never lingers unexplained.
          const d = G.dist(plan.hub, plan.other), dem = G.baseDemand(s, plan.hub, plan.other);
          const short = [plan.hub, plan.other].filter(c => G.slotsAvail(s, i, c) < 2);
          const full = short.find(c => G.airportFree(s, c) <= 0);
          const planesIdle = !!pickType(s, i, d, dem, true);
          const onOrder = A.orders.some(o => PLANE[o.type].range >= d);
          let blocker = null;
          for (const c of short) wantSlots(s, i, c);
          if (full) blocker = `${CITY[full].name} airport is full`;
          else if (short.length) blocker = `slots at ${short.join(' and ')}${A.pending.some(p => p.kind === 'slots' && short.includes(p.city)) ? ' (talks under way)' : ''}`;
          if (!planesIdle && !onOrder) {
            const T = pickType(s, i, d, dem, false);
            if (T && A.cash > G.planePrice(s, i, T.id) * 2 + 20) G.buyPlanes(s, i, T.id, 2);
            else blocker = blocker ? `${blocker}; no cash for aircraft` : 'not enough cash for aircraft';
          }
          const ordered = !planesIdle && A.orders.some(o => PLANE[o.type].range >= d);
          if (!blocker && ordered) blocker = 'aircraft on order, arriving next quarter';
          if (!blocker) blocker = 'too few seats of demand left for a viable schedule';
          const stage = short.length ? 'securing slots' : !planesIdle ? 'getting aircraft' : 'ready to launch';
          const tries = (plan.tries || 0) + 1, MAX = 3;
          if (full || tries > MAX) say('hold', `${A.name} abandons its ${t.a}–${t.b} challenge${tries > MAX ? ` after ${MAX} quarters` : ''}: ${blocker}.`, { a: t.a, b: t.b });
          else {
            A.keep = { ...plan, tries, stage, blocker, text: `Launch plan ${t.a}–${t.b}: ${stage} (quarter ${tries} of ${MAX}). Waiting for: ${blocker}. If it is not ready by then, the plan is dropped.` };
            if (tries === 1 || stage !== plan.stage) say('hold', `${A.name} is ${stage} for its ${t.a}–${t.b} launch. Waiting for: ${blocker}.`, { a: t.a, b: t.b });
          }
        }
      } else say('hold', `${A.name} drops its ${t.a}–${t.b} challenge: ${G.routeBlock(s, i, plan.hub, plan.other)}`, { a: t.a, b: t.b });
    }

    // 4. grow the network: put idle aircraft on the best routes they can reach, then line up slots
    const cands = candidates(s, i);
    if (plan && plan.kind === 'expand') cands.sort((x, y) => (y.hub === plan.a && y.c === plan.b) - (x.hub === plan.a && x.c === plan.b));
    let opened = 0;
    // aircraft held back for an announced launch are not spent on other routes
    const reserve = A.keep && A.keep.kind === 'attack' ? 2 : 0;
    for (const k of cands.slice(0, 30)) {
      if (G.idleTotal(s, i) <= reserve) break;
      if (G.slotsAvail(s, i, k.hub) < 2 || G.slotsAvail(s, i, k.c) < 2) continue;
      if (tryOpen(s, i, k.hub, k.c, P.fare)) opened++;
    }
    const reach = Math.max(0, ...G.fleetTypes(A).map(t => PLANE[t].range), ...A.orders.map(o => PLANE[o.type].range));
    const top = cands.slice(0, 12);
    for (const k of top.filter(k => k.d <= reach || G.rnd(s) < 0.3).slice(0, 5)) { wantSlots(s, i, k.c); wantSlots(s, i, k.hub, 15); }

    // 5. hubs
    if (G.agentsLeft(s, i) > 0 && !endgame) {
      for (const R of REGIONS) {
        if (A.hubs.some(h => CITY[h].region === R.id)) continue;
        const c = (plan && plan.kind === 'hub' && CITY[plan.city].region === R.id && !G.hubBlock(s, i, plan.city) && CITY[plan.city]) ||
          CITIES.find(c => c.region === R.id && !G.hubBlock(s, i, c.code));
        if (c && A.cash > G.hubPrice(s, c.code) + P.hubCash) {
          if (G.buildHub(s, i, c.code).ok) say('hub', `${A.name} is building a hub in ${c.name}.`);
          break;
        }
      }
    }

    // 6. aircraft: buy when nothing is idle, or when idle planes can't reach anything worth flying
    A.idleTurns = G.idleTotal(s, i) ? (A.idleTurns || 0) + 1 : 0;
    if (!endgame && (G.idleTotal(s, i) <= 1 || (!opened && A.idleTurns >= 2) || A.cash > 300) && !A.orders.length && A.cash > 60) {
      const k = top.find(k => G.slotsAvail(s, i, k.hub) >= 3 && G.slotsAvail(s, i, k.c) >= 3) || top[0];
      if (k) {
        const T = pickType(s, i, k.d, G.baseDemand(s, k.hub, k.c), false);
        if (T) {
          const n = G.clamp(Math.floor(A.cash / (G.planePrice(s, i, T.id) * 1.8) * P.expand), 1, 6);
          G.buyPlanes(s, i, T.id, n);
        }
      }
    }
    if (A.idleTurns >= 4) for (const t of G.fleetTypes(A)) if (G.idle(s, i, t) > 0) G.sellPlanes(s, i, t, G.idle(s, i, t));
    for (const t of G.fleetTypes(A)) if (G.idle(s, i, t) > 0 && G.avgAge(s, A, t) > 22) G.sellPlanes(s, i, t, G.idle(s, i, t));

    // 7. businesses, goodwill and advertising
    if (!endgame && A.cash > 260 && G.rnd(s) < 0.35) {
      const cities = [...new Set(G.routesOf(s, i).flatMap(r => [r.a, r.b]))];
      const code = cities.length && G.pick(s, cities);
      const type = G.pick(s, P.biz);
      if (code && !G.bizBlock(s, i, code, type)) G.buyBusiness(s, i, code, type);
    }
    if (G.rnd(s) < 0.2 && A.cash > 120) {
      const cities = Object.keys(A.slots);
      if (cities.length) { G.pay(A, -5, 'network'); G.addRel(s, i, G.pick(s, cities), 8); }
    }
    if (!endgame && G.agentsLeft(s, i) > 0 && A.cash > 300 && G.rnd(s) < P.ad)
      G.adCampaign(s, i, CITY[G.pick(s, A.hubs)].region, A.cash > 800 ? 1 : 0);

    // 8. decide next quarter's headline move now, so the player can see it coming
    A.intent = A.keep || planNext(s, i, cands, friend);
    A.keep = null;
  };

  // A rival's next big move, chosen a quarter ahead and shown on the Rivals screen.
  function planNext(s, i, cands, friend) {
    const A = s.airlines[i], P = G.PERSONALITIES[A.pers], player = s.airlines[0];
    if (!friend && !player.bankrupt && G.rnd(s) < P.attack) {
      const targets = G.routesOf(s, 0).filter(r => r.last && r.last.profit > 0).sort((x, y) => y.last.profit - x.last.profit).slice(0, 4);
      for (const t of targets) {
        const hub = [t.a, t.b].find(h => A.hubs.includes(h));
        if (!hub) continue;
        const other = hub === t.a ? t.b : t.a;
        if (G.routeBlock(s, i, hub, other)) continue;
        const fare = G.clamp(t.fare + P.cut, -50, 50);
        wantSlots(s, i, other); wantSlots(s, i, hub);
        return { kind: 'attack', a: t.a, b: t.b, hub, other, fare, text: `Preparing to launch ${t.a}–${t.b} against you at about ${fare >= 0 ? '+' : ''}${fare}%.` };
      }
    }
    // Exposed profits draw challengers from anywhere: a high fare with no competition invites someone to
    // apply for traffic rights, hub or no hub. Fatter margins draw them faster.
    if (!friend && !player.bankrupt && A.cash > 150 * Math.max(0.3, G.eraScale(s))) {
      const exposed = G.exposedRoutes(s).filter(x => !s.airlines.some((B, j) => j !== i && B.intent && B.intent.kind === 'attack' && G.pairKey(B.intent.a, B.intent.b) === G.pairKey(x.r.a, x.r.b)));
      for (const x of exposed.slice(0, 3)) {
        if (G.rnd(s) > x.lure * (0.5 + P.attack)) continue;
        const t = x.r, from = A.hubs.find(h => [t.a, t.b].includes(h));
        const hub = from || t.a, other = hub === t.a ? t.b : t.a;
        if (G.cityClosed(s, i, other) || G.cityClosed(s, i, hub)) continue;
        const fare = G.clamp(Math.min(t.fare + P.cut, P.fare + 20), -50, 50);
        wantSlots(s, i, other); wantSlots(s, i, hub);
        return { kind: 'attack', a: t.a, b: t.b, hub, other, fare, permit: !from, text: `Your ${t.fare >= 0 ? '+' : ''}${t.fare}% fare on ${t.a}–${t.b} has no competition. ${from ? 'Preparing to launch it' : 'Applying for traffic rights to fly it'} at about ${fare >= 0 ? '+' : ''}${fare}%.` };
      }
    }
    const missing = REGIONS.filter(R => !A.hubs.some(h => CITY[h].region === R.id));
    if (missing.length) {
      const R = missing[0], c = CITIES.find(c => c.region === R.id && !G.hubBlock(s, i, c.code));
      if (c && A.cash > (G.hubPrice(s, c.code) + P.hubCash) * 0.6) return { kind: 'hub', city: c.code, text: `Raising money for a hub in ${c.name}.` };
    }
    const k = cands.find(k => !s.routes.some(r => r.o === i && G.pairKey(r.a, r.b) === G.pairKey(k.hub, k.c)));
    if (k) {
      const vsYou = s.routes.some(r => r.o === 0 && G.pairKey(r.a, r.b) === G.pairKey(k.hub, k.c));
      return { kind: 'expand', a: k.hub, b: k.c, text: `Eyeing ${CITY[k.hub].name}–${CITY[k.c].name}${vsYou ? ', a route you already fly' : ''}.` };
    }
    return { kind: 'quiet', text: 'No big moves expected.' };
  }
})(globalThis.G);