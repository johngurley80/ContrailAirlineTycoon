// The quarterly board meeting: advisors read the last quarter and point at what needs attention.
(function (G) {
  'use strict';
  const { CITY, REGIONS, REGION, PLANE } = G;
  const nf = n => Math.round(n).toLocaleString('en-US');

  G.advise = function (s, rep) {
    const A = s.airlines[0], cards = [];
    const add = (who, text, action, weight) => cards.push({ who, text, action, weight });
    const mine = G.routesOf(s, 0).filter(r => r.last);

    const full = mine.filter(r => r.last.spill > 2000).sort((x, y) => y.last.spill - x.last.spill)[0];
    if (full) add('ops', `${full.a}–${full.b} turned away about ${nf(full.last.spill)} passengers. Add flights, use bigger aircraft or raise the fare.`, { kind: 'route', id: full.id }, 9);
    const loser = mine.filter(r => r.losses >= 2 || (r.last.profit < -0.5 && r.age >= 2)).sort((x, y) => x.last.profit - y.last.profit)[0];
    if (loser) add('fin', `${loser.a}–${loser.b} lost ${G.fmtM(-loser.last.profit)} last quarter. Cut the fare, swap the aircraft or close it.`, { kind: 'route', id: loser.id }, 8);
    const idle = G.idleTotal(s, 0);
    if (idle > 0) add('ops', `${idle} aircraft sat idle last quarter, still costing ownership and upkeep. Put them on a route or sell them.`, { kind: 'tab', tab: 'fleet' }, 7);
    if (A.cash < 0) add('fin', `We're overdrawn and paying 3% interest. Bankruptcy hits below ${G.fmtM(-G.creditLimit(s, 0))}.`, { kind: 'tab', tab: 'company' }, 10);
    else if (A.cash > 350 && idle === 0 && !A.orders.length) add('fin', `${G.fmtM(A.cash)} is sitting in the bank. Money that isn't flying isn't earning.`, { kind: 'tab', tab: 'fleet' }, 4);

    const tight = A.hubs.filter(h => G.slotsAvail(s, 0, h) < 4)[0];
    if (tight) add('gov', `Only ${Math.max(0, G.slotsAvail(s, 0, tight))} free slots left at our ${CITY[tight].name} hub. Send a negotiator before rivals take them.`, { kind: 'city', code: tight }, 7);

    const hubable = G.CITIES.find(c => !G.hubBlock(s, 0, c.code));
    if (hubable) add('strat', `We already fly to ${hubable.name}. A hub there would open all of ${REGION[hubable.region].name} to us.`, { kind: 'city', code: hubable.code }, 8);
    else {
      const missing = REGIONS.filter(R => !A.hubs.some(h => CITY[h].region === R.id));
      if (missing.length) {
        const R = missing[0];
        const target = G.CITIES.filter(c => c.region === R.id && c.major && !G.cityClosed(s, 0, c.code))
          .find(c => A.hubs.some(h => !G.routeBlock(s, 0, h, c.code)));
        if (target) add('strat', `We have no hub in ${R.name}. Fly to ${target.name} first, then build one there.`, { kind: 'city', code: target.code }, 5);
      }
    }

    const g = G.goalStatus(s, 0);
    const homeR = CITY[A.home].region;
    if (!g.leads.includes(homeR) && (A.yr.pax[homeR] || 0) > 0) add('strat', `A rival carries more passengers than us in ${REGION[homeR].name}, our home region. We must lead it to win.`, { kind: 'tab', tab: 'company' }, 6);

    const attackers = rep.rivals.filter(m => m.kind === 'attack' || m.kind === 'war');
    if (attackers.length) add('strat', `Rivals are moving on our routes. Matching their fares protects passengers but squeezes margins.`, { kind: 'tab', tab: 'routes' }, 6);

    const fresh = G.PLANES.filter(p => p.intro === s.year && G.canBuy(s, 0, p.id));
    if (s.q === 0 && fresh.length) add('ops', `New on the market this year: ${fresh.map(p => `${p.name} (${p.seats} seats, ${nf(p.range)} km)`).join(', ')}.`, { kind: 'tab', tab: 'fleet' }, 6);
    const old = G.fleetTypes(A).filter(t => G.avgAge(s, A, t) > 18);
    if (old.length) add('ops', `Our ${old.map(t => PLANE[t].name).join(', ')} fleet is over 18 years old. Upkeep keeps rising; think about replacing it.`, { kind: 'tab', tab: 'fleet' }, 3);
    const lowRel = Object.keys(A.slots).find(c => G.rel(s, 0, c) < 25);
    if (lowRel) add('gov', `${CITY[lowRel].name} officials are cooling on us (relations ${Math.round(G.rel(s, 0, lowRel))}). Slot talks there will be hard. Businesses and favors help.`, { kind: 'city', code: lowRel }, 4);

    return cards.sort((x, y) => y.weight - x.weight).slice(0, 4);
  };

  G.fmtM = function (m) {
    const a = Math.abs(m), sign = m < 0 ? '−' : '';
    return sign + '$' + (a >= 1000 ? (a / 1000).toFixed(2) + 'B' : a.toFixed(1) + 'M');
  };
})(globalThis.G);
