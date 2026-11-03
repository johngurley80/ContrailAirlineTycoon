# Contrail Airline Tycoon

Build a world airline from a single city across twenty years of aviation history. Win airport slots, build hubs on every continent, connect passengers through your network and outfly three rival CEOs. Plays in any browser and is designed for phones.

## Playing

Open the site and choose a full campaign (pick an era: 1955, 1970, 1985 or 2000, a home city and an objective) or a short historical scenario. Then plan routes from the map. Each turn is one quarter: plan, then press **End quarter**.

The classic objective is a world airline: at the end of any year, have a hub in all seven regions, carry the most passengers in enough regions (including your home region) and turn a profit. You can instead play as a regional champion, a premium airline or a low-cost network. Scenarios (the 1973 oil shock, US deregulation, the Asian boom, a Gulf super-hub, the crisis decade) last five or six years.

Your game saves automatically in your browser.

## Features

- A passenger network model: travellers fly direct or connect through your hubs. Business travellers value frequency and service; leisure travellers chase low fares
- 166 airports, with an airport finder and map filters for profit, competition and spare capacity
- Each route shows where its passengers went: lost to fares, to infrequent flights, to rivals, to full flights or to full connections
- One quarter-end screen with a profit bridge, an urgent list with links to the routes involved, and an urgent-only mode
- Four historical eras with real aircraft, the Cold War, oil shocks and the Olympics
- Rival airlines with distinct personalities that announce their next move a quarter ahead and respond to what you actually did
- Crises with choices (fuel surcharges, retrofits, capacity cuts, fare sales) and city contracts with slots, subsidies and lasting demand
- Advisors' plans for a chosen goal: profit, market share or satisfaction
- City relations, slot negotiations, businesses and city requests
- Finance: credit ratings, bank loans, aircraft leasing and fuel hedging
- Route history charts and an advisor that tests fares, frequencies, aircraft and service levels
- Quarterly scorecard, rival comparison charts, codeshares, route purchases and takeovers
- Milestones and a records book

## Development

No dependencies. Requires Node 18 or later.

```bash
npm run build   # writes dist/index.html
npm run sim     # computer-only games across all eras, for balance
npm run play    # a scripted playthrough: node tools/play.js [era] [home] [seed]
npm run check   # headless check of the strategy features
```

Source layout:

- `src/data` – cities, aircraft, history, rival personalities and businesses
- `src/engine` – the game rules (plain JavaScript, runs in Node and the browser)
- `src/ui` – the interface: map, sheets, panels, modals and charts
- `src/shell.html` – page markup and styles
- `build.js` – inlines everything into a single HTML file

All city, aircraft and historical data is original or drawn from public facts; all airlines and people in the game are fictional.
