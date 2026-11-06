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
    { y: 1959, q: 0, kind: 'city', city: 'HAV', mult: 0.45, left: 120, text: 'Revolution in Cuba: Havana\u2019s tourist trade collapses.' },
    { y: 1970, q: 2, kind: 'region', region: 'ME', mult: 0.88, fear: 0.1, left: 2, text: 'A wave of hijackings ends with airliners blown up in the Jordanian desert.' },
    { y: 1973, q: 0, kind: 'fuel', cost: true, quiet: true, mult: 1.03, perm: true, left: 0, text: 'Passenger screening becomes mandatory at airports. Costs rise 3% for good.' },
    { y: 1975, q: 1, kind: 'city', city: 'BEY', mult: 0.3, left: 60, text: 'Civil war in Lebanon: Beirut, the Middle East\u2019s playground, goes dark.' },
    { y: 1976, q: 0, kind: 'news', text: 'Concorde enters service: London and Paris to New York in three and a half hours.' },
    { y: 1977, q: 2, kind: 'pair', a: 'LHR', b: 'JFK', mult: 0.88, left: 18, text: 'Laker Skytrain starts walk-on London\u2013New York flights at a third of the usual fare. Other airlines lose price-conscious travellers.' },
    { y: 1979, q: 1, kind: 'ground', type: 'DC10', share: 0.4, left: 1, text: 'After the Chicago crash, every DC-10 is grounded for five weeks.' },
    { y: 1980, q: 2, kind: 'region', region: 'ME', mult: 0.88, fear: 0.05, left: 6, text: 'War between Iran and Iraq: Gulf airspace and airports become dangerous.' },
    { y: 1981, q: 2, kind: 'region', region: 'NA', mult: 0.88, left: 2, text: 'US air traffic controllers strike and are fired: flights across America are cut back.' },
    { y: 1982, q: 1, kind: 'city', city: 'EZE', mult: 0.6, left: 2, text: 'War over the Falkland Islands: travel to Buenos Aires slumps.' },
    { y: 1982, q: 2, kind: 'region', region: 'SA', mult: 0.85, left: 8, text: 'Latin American debt crisis: Mexico defaults and South American economies stall.' },
    { y: 1986, q: 0, kind: 'fuel', mult: 0.75, left: 4, text: 'Oil prices collapse as OPEC opens the taps. Fuel is suddenly cheap.' },
    { y: 1986, q: 1, kind: 'region', region: 'EU', mult: 0.88, fear: 0.1, left: 2, text: 'Terror attacks and the Chernobyl disaster: Americans cancel European holidays in droves.' },
    { y: 1989, q: 1, kind: 'city', cities: ['PEK', 'SHA', 'CAN'], mult: 0.5, left: 4, text: 'Tiananmen Square: tourists and business travellers abandon China.' },
    { y: 1991, q: 0, kind: 'world', mult: 0.82, fear: 0.15, left: 1, text: 'War in the Gulf: fear of terrorism empties flights worldwide.' },
    { y: 1994, q: 3, kind: 'pair', pairs: [['LHR', 'CDG'], ['LHR', 'BRU']], mult: 0.6, perm: true, left: 0, text: 'The Channel Tunnel opens. Eurostar trains take a big share of London\u2013Paris and London\u2013Brussels travellers.' },
    { y: 1995, q: 0, kind: 'city', city: 'ITM', mult: 0.75, left: 2, text: 'The Kobe earthquake devastates the Osaka region.' },
    { y: 1997, q: 2, kind: 'news', text: 'Hong Kong returns to China. Business carries on.' },
    { y: 1998, q: 2, kind: 'cap', city: 'HKG', grow: 0.5, text: 'Hong Kong\u2019s new airport at Chek Lap Kok opens: room for far more flights.' },
    { y: 1998, q: 2, kind: 'city', cities: ['SVO', 'LED'], mult: 0.7, left: 4, text: 'Russia defaults on its debts. The rouble crashes and Russians stop travelling.' },
    { y: 2000, q: 2, kind: 'ground', type: 'CONC', share: 1, left: 5, text: 'A Concorde crashes outside Paris. Every Concorde is grounded while it is modified.' },
    { y: 2003, q: 3, kind: 'ground', type: 'CONC', share: 1, perm: true, left: 0, text: 'Concorde makes its last flights. The supersonic era ends: any you own can only be sold.' },
    { y: 2005, q: 0, kind: 'city', cities: ['BKK', 'CMB', 'MLE'], mult: 0.65, left: 2, text: 'The Indian Ocean tsunami wrecks beach resorts from Thailand to the Maldives.' },
    { y: 2005, q: 2, kind: 'city', city: 'MSY', mult: 0.3, left: 6, text: 'Hurricane Katrina floods New Orleans.' },
    { y: 2006, q: 2, kind: 'fuel', cost: true, quiet: true, mult: 1.03, left: 4, text: 'A plot to bomb airliners with liquid explosives: new security rules raise costs for a year.' },
    { y: 2009, q: 1, kind: 'city', cities: ['MEX', 'CUN'], mult: 0.55, fear: 0.1, left: 2, text: 'Swine flu breaks out in Mexico: travellers stay away.' },
    { y: 2011, q: 0, kind: 'city', cities: ['HND', 'ITM', 'CTS'], mult: 0.7, fear: 0.15, left: 2, text: 'A huge earthquake and tsunami strike Japan, followed by the Fukushima nuclear accident.' },
    { y: 2013, q: 0, kind: 'ground', type: 'B788', share: 0.8, left: 1, text: 'Battery fires ground the 787 fleet worldwide.' },
    { y: 2014, q: 2, kind: 'region', region: 'AF', mult: 0.88, fear: 0.08, left: 4, text: 'Ebola spreads in West Africa: travel to the whole continent suffers.' },
    { y: 2014, q: 3, kind: 'fuel', mult: 0.8, left: 4, text: 'Oil prices halve as US shale floods the market. Fuel costs tumble.' },
    { y: 2015, q: 3, kind: 'city', city: 'CDG', mult: 0.8, fear: 0.1, left: 2, text: 'Terror attacks in Paris keep visitors away.' },
    { y: 2019, q: 0, kind: 'ground', type: 'B38M', share: 1, perm: true, left: 0, text: 'After two crashes, every 737 MAX in the world is grounded. Nobody knows for how long.' },
    { y: 2016, q: 0, kind: 'city', city: 'BRU', mult: 0.7, fear: 0.1, left: 1, text: 'Bombs at Brussels airport close it for weeks.' },
    { y: 1956, q: 3, kind: 'region', region: 'ME', mult: 0.75, left: 3, text: 'Suez Crisis: the canal closes and Middle East travel slumps.', fuel: 1.15 },
    { y: 1958, q: 3, kind: 'news', text: 'Jet service across the Atlantic begins. Propliner passengers start defecting to jets.' },
    { y: 1962, q: 3, kind: 'region', region: 'NA', mult: 0.85, left: 1, text: 'Cuban Missile Crisis: Americans stay home for a tense quarter.' },
    { y: 1967, q: 1, kind: 'region', region: 'ME', mult: 0.7, left: 2, text: 'War in the Middle East: regional demand falls 30%.' },
    { y: 1970, q: 0, kind: 'news', text: 'The jumbo jet era begins. 747s can carry more than 350 passengers.' },
    { y: 1973, q: 3, kind: 'fuel', mult: 1.8, left: 6, text: 'Oil embargo! Fuel prices soar for a year and a half.' },
    { y: 1978, q: 3, kind: 'region', region: 'NA', mult: 1.15, left: 40, text: 'US airline deregulation sparks a travel boom in North America.' },
    { y: 1979, q: 0, kind: 'open', text: 'China opens its doors. Beijing, Shanghai and Guangzhou now welcome foreign airlines.' },
    { y: 1979, q: 0, kind: 'city', city: 'THR', mult: 0.4, left: 8, text: 'Revolution in Iran: Tehran traffic collapses.', fuel: 1.5 },
    { y: 1987, q: 3, kind: 'world', mult: 0.9, left: 2, text: 'Black Monday: a stock market crash dents travel budgets.' },
    { y: 1989, q: 3, kind: 'region', region: 'EU', mult: 1.12, left: 8, text: 'The Berlin Wall falls. Travel across Europe surges.' },
    { y: 1990, q: 2, kind: 'region', region: 'ME', mult: 0.6, left: 3, text: 'Gulf crisis: Middle East demand drops and fuel spikes.', fuel: 1.6 },
    { y: 1991, q: 3, kind: 'coldwar', text: 'The Soviet Union dissolves. Any airline may now buy any aircraft and negotiate anywhere.' },
    { y: 1993, q: 0, kind: 'region', region: 'EU', mult: 1.1, left: 40, text: 'The European single market opens. Intra-European travel grows.' },
    { y: 1997, q: 2, kind: 'region', region: 'AS', mult: 0.75, left: 4, text: 'Asian financial crisis: currencies crash and travel shrinks.' },
    { y: 2001, q: 2, kind: 'world', mult: 0.75, fear: 0.15, left: 3, text: 'Terror attacks in the United States shake global aviation.' },
    { y: 2003, q: 1, kind: 'region', region: 'AS', mult: 0.6, fear: 0.25, left: 2, text: 'SARS outbreak: Asian travel plunges.' },
    { y: 2008, q: 3, kind: 'world', mult: 0.85, left: 4, text: 'Global financial crisis: business travel dries up.', biz: true },
    { y: 2010, q: 1, kind: 'region', region: 'EU', mult: 0.55, left: 1, text: 'A volcanic ash cloud grounds flights across Europe.' },
    { y: 2011, q: 0, kind: 'city', city: 'CAI', mult: 0.6, left: 4, text: 'Unrest in Egypt: Cairo demand falls.' },
    { y: 2014, q: 0, kind: 'news', text: 'Skylance unveils a supersonic concept airliner. Orders are open.' },
  ].sort((x, y) => x.y - y.y || x.q - y.q);
  // [year, host city, quarter the Games are held (0-based)]: Melbourne, Tokyo and Mexico City held theirs in Q4
  G.OLYMPICS = [[1956, 'MEL', 3], [1960, 'FCO', 2], [1964, 'HND', 3], [1968, 'MEX', 3], [1972, 'MUC', 2], [1976, 'YUL', 2],
    [1980, 'SVO', 2], [1984, 'LAX', 2], [1988, 'GMP', 2], [1992, 'BCN', 2], [1996, 'ATL', 2], [2000, 'SYD', 2],
    [2004, 'ATH', 2], [2008, 'PEK', 2], [2012, 'LHR', 2], [2016, 'GIG', 2]];
  // Football World Cups (June and July): [year, city of the final or main host, quarter]
  G.WORLD_CUPS = [[1958, 'ARN', 1], [1962, 'SCL', 1], [1966, 'LHR', 2], [1970, 'MEX', 1], [1974, 'MUC', 1], [1978, 'EZE', 1],
    [1982, 'MAD', 1], [1986, 'MEX', 1], [1990, 'FCO', 1], [1994, 'LAX', 1], [1998, 'CDG', 1], [2002, 'GMP', 1],
    [2006, 'BER', 1], [2010, 'JNB', 1], [2014, 'GIG', 1], [2018, 'SVO', 1]];
  // World Expos, open roughly April to October: [year, city]
  G.EXPOS = [[1958, 'BRU'], [1962, 'SEA'], [1964, 'JFK'], [1967, 'YUL'], [1970, 'ITM'], [1986, 'YVR'], [1998, 'LIS'], [2010, 'SHA'], [2015, 'MXP']];
})(globalThis.G = globalThis.G || {});
