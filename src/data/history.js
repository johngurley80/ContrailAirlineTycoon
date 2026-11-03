// Eras, economic indices and the historical timeline.
(function (G) {
  'use strict';
  G.ERAS = [
    { id: 1955, name: 'Dawn of the Jet Age', years: '1955–1974', end: 1975, cash: 120,
      blurb: 'Propliners give way to the 707. Cold War blocs decide who sells you aircraft.' },
    { id: 1970, name: 'Jumbos and Oil Shocks', years: '1970–1989', end: 1990, cash: 200,
      blurb: 'The 747 arrives just as oil prices explode. China stays closed until 1979.' },
    { id: 1985, name: 'Open Skies', years: '1985–2004', end: 2005, cash: 260,
      blurb: 'The Iron Curtain falls, Asia booms, and twin-engine jets cross oceans.' },
    { id: 2000, name: 'The Global Network', years: '2000–2019', end: 2020, cash: 300,
      blurb: 'Gulf super-hubs, the A380, crises and comebacks — and a new supersonic dream.' },
  ];
  G.ERA = Object.fromEntries(G.ERAS.map(e => [e.id, e]));

  // [year, passenger demand index, fare index, oil index]
  const IDX = [
    [1955, 0.3, 1.9, 0.6], [1965, 0.45, 1.6, 0.6], [1972, 0.58, 1.42, 0.65], [1974, 0.6, 1.4, 1.4],
    [1979, 0.68, 1.3, 1.2], [1981, 0.7, 1.26, 1.6], [1986, 0.78, 1.16, 0.85], [1995, 0.92, 1.04, 0.8],
    [2000, 1.0, 1.0, 1.0], [2004, 1.08, 0.96, 1.2], [2008, 1.22, 0.92, 1.7], [2012, 1.3, 0.9, 1.6],
    [2015, 1.4, 0.88, 1.0], [2020, 1.55, 0.85, 1.05],
  ];
  function interp(y, k) {
    if (y <= IDX[0][0]) return IDX[0][k];
    for (let i = 1; i < IDX.length; i++) {
      if (y <= IDX[i][0]) {
        const [y0, y1] = [IDX[i - 1][0], IDX[i][0]], t = (y - y0) / (y1 - y0);
        return IDX[i - 1][k] + t * (IDX[i][k] - IDX[i - 1][k]);
      }
    }
    return IDX[IDX.length - 1][k];
  }
  G.demandIndex = y => interp(y, 1);
  G.fareIndex = y => interp(y, 2);
  G.oilIndex = y => interp(y, 3);
  G.COLD_WAR_ENDS = 1991;

  // Scheduled history. scope: world | region | city ; mult on demand unless kind says otherwise.
  G.HISTORY = [
    { y: 1956, q: 3, kind: 'region', region: 'ME', mult: 0.75, left: 3, text: 'Suez Crisis: the canal closes and Middle East travel slumps.', fuel: 1.15 },
    { y: 1958, q: 3, kind: 'news', text: 'Jet service across the Atlantic begins. Propliner passengers start defecting to jets.' },
    { y: 1962, q: 3, kind: 'region', region: 'NA', mult: 0.85, left: 1, text: 'Cuban Missile Crisis: Americans stay home for a tense quarter.' },
    { y: 1967, q: 1, kind: 'region', region: 'ME', mult: 0.7, left: 2, text: 'War in the Middle East: regional demand falls 30%.' },
    { y: 1970, q: 0, kind: 'news', text: 'The jumbo jet era begins. 747s can carry more than 350 passengers.' },
    { y: 1973, q: 3, kind: 'fuel', mult: 1.8, left: 6, text: 'Oil embargo! Fuel prices soar for a year and a half.' },
    { y: 1978, q: 3, kind: 'region', region: 'NA', mult: 1.15, left: 40, text: 'US airline deregulation sparks a travel boom in North America.' },
    { y: 1979, q: 0, kind: 'open', text: 'China opens its doors. Beijing, Shanghai and Guangzhou now welcome foreign airlines.' },
    { y: 1979, q: 1, kind: 'city', city: 'THR', mult: 0.4, left: 8, text: 'Revolution in Iran: Tehran traffic collapses.', fuel: 1.5 },
    { y: 1987, q: 3, kind: 'world', mult: 0.9, left: 2, text: 'Black Monday: a stock market crash dents travel budgets.' },
    { y: 1989, q: 3, kind: 'region', region: 'EU', mult: 1.12, left: 8, text: 'The Berlin Wall falls. Travel across Europe surges.' },
    { y: 1990, q: 2, kind: 'region', region: 'ME', mult: 0.6, left: 3, text: 'Gulf crisis: Middle East demand drops and fuel spikes.', fuel: 1.6 },
    { y: 1991, q: 3, kind: 'coldwar', text: 'The Soviet Union dissolves. Any airline may now buy any aircraft and negotiate anywhere.' },
    { y: 1993, q: 0, kind: 'region', region: 'EU', mult: 1.1, left: 40, text: 'The European single market opens. Intra-European travel grows.' },
    { y: 1997, q: 2, kind: 'region', region: 'AS', mult: 0.75, left: 4, text: 'Asian financial crisis: currencies crash and travel shrinks.' },
    { y: 2001, q: 2, kind: 'world', mult: 0.75, left: 3, text: 'Terror attacks in the United States shake global aviation.' },
    { y: 2003, q: 1, kind: 'region', region: 'AS', mult: 0.6, left: 2, text: 'SARS outbreak: Asian travel plunges.' },
    { y: 2008, q: 3, kind: 'world', mult: 0.85, left: 4, text: 'Global financial crisis: business travel dries up.' },
    { y: 2010, q: 1, kind: 'region', region: 'EU', mult: 0.55, left: 1, text: 'A volcanic ash cloud grounds flights across Europe.' },
    { y: 2011, q: 0, kind: 'city', city: 'CAI', mult: 0.6, left: 4, text: 'Unrest in Egypt: Cairo demand falls.' },
    { y: 2014, q: 0, kind: 'news', text: 'Skylance unveils a supersonic concept airliner. Orders are open.' },
  ];
  G.OLYMPICS = [[1956, 'MEL'], [1960, 'FCO'], [1964, 'HND'], [1968, 'MEX'], [1972, 'MUC'], [1976, 'YUL'],
    [1980, 'SVO'], [1984, 'LAX'], [1988, 'GMP'], [1992, 'BCN'], [1996, 'ATL'], [2000, 'SYD'],
    [2004, 'ATH'], [2008, 'PEK'], [2012, 'LHR'], [2016, 'GIG']];
})(globalThis.G = globalThis.G || {});
