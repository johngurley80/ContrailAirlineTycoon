// Rival personalities, executives, advisors and business types. All names are fictional.
(function (G) {
  'use strict';
  G.PERSONALITIES = {
    shark: {
      label: 'Aggressive', blurb: 'Goes after your best routes and starts price wars.',
      fare: -5, attack: 0.55, cut: -20, expand: 1.1, hubCash: 110, ad: 0.2, biz: ['agency', 'hotel'], big: 0.5, maxShort: 0,
      taunts: ['Nice route, {player}. Shame about the fares.', 'We\'re flying {route} now. Try to keep up.', 'Your passengers on {route} just found a better deal.', 'Every route you open is a route I can take.'],
      retort: ['Price war? We were born for this.', 'Cut all you like, {player}. We\'ll cut deeper.'],
    },
    empire: {
      label: 'Expansionist', blurb: 'Plants hubs everywhere and grows at any cost.',
      fare: 0, attack: 0.15, cut: -10, expand: 1.5, hubCash: 60, ad: 0.25, biz: ['feeder', 'convention'], big: 0.6, maxShort: 0,
      taunts: ['The map looks better in our colors.', 'Another hub, another region. Where are you, {player}?', 'We\'ll be in {region} before you\'ve found it on a map.'],
      retort: ['Fine. We\'ll make it up on volume.'],
    },
    luxe: {
      label: 'Premium', blurb: 'Charges more, flies the newest jets and buys grand hotels.',
      fare: 15, attack: 0.05, cut: -5, expand: 0.9, hubCash: 140, ad: 0.5, biz: ['grand', 'resort', 'park'], big: 0.9, maxShort: 0, appeal: 1.12,
      taunts: ['Our passengers don\'t mind paying for quality.', 'Cheap seats are your business, {player}. Comfort is ours.', 'Champagne is served on {route}. What do you serve?'],
      retort: ['We don\'t race to the bottom.'],
    },
    budget: {
      label: 'Low-cost', blurb: 'Packs small jets, flies often and undercuts everyone.',
      fare: -15, attack: 0.3, cut: -12, expand: 1.2, hubCash: 120, ad: 0.1, biz: ['kitchen', 'agency'], big: 0.1, maxShort: 5500, cost: 0.85,
      taunts: ['Why pay more? {route} is cheaper with us.', 'Our seats fly full. Do yours, {player}?', 'Frills are for losers.'],
      retort: ['Lower? Watch this.'],
    },
  };
  G.RIVALS = [
    { airline: 'Meridian Airways', ceo: 'Viktor Hale' },
    { airline: 'Polaris Air', ceo: 'Ingrid Solberg' },
    { airline: 'Austral Wings', ceo: 'Dolores Vance' },
    { airline: 'Atlas Global', ceo: 'Rafael Montoya' },
    { airline: 'Sirocco Air', ceo: 'Hamid Rahimi' },
    { airline: 'Kestrel Airlines', ceo: 'Kenji Arakawa' },
    { airline: 'Lumen Air', ceo: 'Celeste Duval' },
    { airline: 'Baobab Airways', ceo: 'Marguerite Okonkwo' },
  ];
  G.ADVISORS = {
    ops: { name: 'Priya Natarajan', role: 'Operations' },
    fin: { name: 'Tom Barrow', role: 'Finance' },
    strat: { name: 'Lena Fischer', role: 'Strategy' },
    gov: { name: 'Omar Haddad', role: 'Government relations' },
  };
  G.COLORS = ['#f4b13e', '#4cc3e8', '#ef6f6c', '#a98bf0'];

  // cost $M, income formula inputs, and effects. Each city has 6 plots shared by all airlines.
  G.BUSINESSES = {
    hotel: { name: 'City Hotel', cost: 14, blurb: 'Steady income from business travellers.', base: 0.4, econ: 0.13, tour: 0.02, pax: 0.5 },
    resort: { name: 'Beach Resort', cost: 28, blurb: 'Tourism demand +10% at this city.', base: 0, econ: 0.04, tour: 0.22, pax: 0.4, minTour: 7, demand: 0.10 },
    grand: { name: 'Grand Hotel', cost: 60, blurb: 'Big earner in rich cities. Your flights here +5% appeal, relations +2 a quarter.', base: 0, econ: 0.42, tour: 0.08, pax: 0.3, appeal: 0.05, rel: 2 },
    agency: { name: 'Travel Agency', cost: 8, blurb: 'Sells your tickets: +12% appeal on your flights here.', base: 0.3, econ: 0.02, tour: 0.02, pax: 0.2, appeal: 0.12 },
    kitchen: { name: 'Catering Kitchen', cost: 10, blurb: 'Your flights from here cost 6% less to run.', base: 0.6, econ: 0.02, tour: 0, pax: 0.1, costCut: 0.06 },
    feeder: { name: 'Commuter Airline', cost: 35, blurb: 'Loses money but feeds +20% passengers into your flights here.', base: -0.9, econ: 0, tour: 0, pax: 0.2, feed: 0.20 },
    park: { name: 'Theme Park', cost: 45, blurb: 'Volatile income. Demand to this city +12% for everyone.', base: -0.5, econ: 0.12, tour: 0.22, pax: 0.3, demand: 0.12, volatile: 1 },
    convention: { name: 'Convention Center', cost: 38, blurb: 'Business demand +8% here. Relations +1 a quarter.', base: 0, econ: 0.3, tour: 0, pax: 0.2, demand: 0.08, rel: 1 },
  };
  G.BIZ_SLOTS = 6;
})(globalThis.G = globalThis.G || {});
