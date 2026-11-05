# Contrail Airline Tycoon

Build a world airline from a single city across twenty years of aviation history. Win airport slots, build hubs on every continent, connect passengers through your network and outfly three rival CEOs. Plays in any browser and is designed for phones.

## Playing

Open the site and choose a full campaign (pick an era: 1955, 1970, 1985 or 2000, a home city and an objective) or a short historical scenario. Then plan routes from the map. Each turn is one quarter: plan, then press **End quarter**.

The classic objective is a world airline: at two year-ends in a row (three on Hard), have a hub in all seven regions, carry the most passengers and at least 36% of them in enough regions (including your home region), fly 40+ routes serving 34+ cities (Normal), and turn a profit. Expect it to take around fifteen years. After a win you can keep flying in sandbox mode until the campaign ends. You can instead play as a regional champion, a premium airline or a low-cost network. Scenarios (the 1973 oil shock, US deregulation, the Asian boom, a Gulf super-hub, the crisis decade) last five or six years.

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
- A board that sets yearly targets (growth, returns, service, network, idle cash). Miss too many and you are replaced; dividends buy goodwill
- Rivals notice fat, uncontested margins and win traffic rights to challenge them, hub or no hub, with a quarter's warning
- Cabin layouts (all economy, two-class, business-heavy) and peak-time departures that need peak slots
- Slot trading: buy rivals' spare slots at a premium, or upgrade your own to peak times
- Fleet commonality costs, heavy maintenance checks every two years, and technical delays for overdue or overworked fleets
- Belly cargo on every flight, and freighter conversions for old aircraft
- Codeshare partners whose flights your passengers can connect to
- A planned-routes list: each route shows the aircraft, slots and forecast it needs, with buy, lease and negotiate buttons right on the row
- Suggested schedules that re-plan frequency and aircraft when you change origin or aircraft type, testing every feasible frequency with the planner's own forecast
- A four-quarter cash forecast with a demand-shock line, and objective stages from Foothold to Champion
- Competition impact: what a rival's entry or fare cut did to your passengers, revenue, profit and share
- "Best moves this quarter": priced, ranked changes (more flights, bigger aircraft, fares, idle aircraft, ready plans) with the buy or negotiate step on the same line
- A quick-edit route table that previews several fare and frequency changes together before applying them
- Stage rewards (slots, a fourth negotiator, goodwill, board backing), a pace check against the deadline, and optional automatic heavy checks
- Guidance that follows your objective: opportunities, advisors, the tutorial and the board all work from the same objective and deadline, and the board sets no targets in the final year
- A harder Crisis Decade: travellers stay home after shocks, so even full flights empty out, while security costs and oil keep climbing
- Best moves show the cash needed, the payback period and the company value each move adds by the finish, split into expanding capacity and adjusting operations
- A profit-to-cash bridge (opening cash, operating profit, contract subsidies, loans, aircraft, slots and more, to closing cash) that reconciles exactly every quarter
- A final-year race card in value games (the gap, how it moved, the rival's earnings edge, the profit needed to close it) and an end-of-game debrief, both read from the same quarter-end snapshots
- "Try on a route" for any aircraft on the market: its forecast on your routes and best untapped markets, the fleet-mix cost and what you would lose selling it again, before you buy
- Rival launch plans that move through securing slots, getting aircraft and launch, say what they are waiting for, and are dropped with a reason after three quarters
- Deadline-aware advice: moves that wait for a delivery or slot talks count from the next quarter, new aircraft count at their resale value, and nothing that cannot pay off is suggested at the finish
- Value for money: Basic service and a poor reputation make fares feel higher and sell more seats at a discount, so maximum fares with minimal service no longer win by default (`npm run fares` compares fare and service policies)
- Flights never carry more passengers than their seats; crisis fare changes are temporary; a crisis choice made in the report is settled in that quarter's cash
- A quiet map (names on hover or tap), aircraft details in the route planner, and soft generative background music
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
npm run regress # regression checks for bugs found in playtests
npm run scen    # scenario balance across seeds: node tools/scen.js [scenario] [seeds]
npm run fares   # fare and service policies compared: node tools/fares.js [scenario] [seeds]
```

Source layout:

- `src/data` – cities, aircraft, history, rival personalities and businesses
- `src/engine` – the game rules (plain JavaScript, runs in Node and the browser)
- `src/ui` – the interface: map, sheets, panels, modals and charts
- `src/shell.html` – page markup and styles
- `build.js` – inlines everything into a single HTML file

All city, aircraft and historical data is original or drawn from public facts; all airlines and people in the game are fictional.
