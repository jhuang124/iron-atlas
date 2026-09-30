# Iron Atlas

A tactile railway board game for 2–5 players. Collect carriage cards, claim routes across America, and complete secret destinations. Play solo with three AI difficulties or pass the device between friends.

The original paper atlas and enamel train pieces use SVG and CSS for 2.5D depth. The game works on phones and desktops, supports touch pan/pinch and keyboard route navigation, and includes a flat map, reduced motion, optional synthesized sound, a field guide, and a guided first game.

## Play

Choose a new journey, keep at least two opening destinations, and take one of three actions each turn: draw carriage cards, claim a route, or draw destinations. Tap any route to preview its payment before confirming a claim. Your tickets can highlight their endpoints. In pass-and-play, each player's hand remains behind a handoff screen.

The classic US rules are pinned to the [official 2015 rulebook](https://ncdn0.daysofwonder.com/tickettoride/en/img/tt_rules_2015_en.pdf): 30 destinations, four starting cards, three opening destinations, 45 trains. Full rules, edition differences, and rare exhaustion safeguards are recorded in [docs/RULES.md](docs/RULES.md).

Games save after every authoritative action, including unfinished card draws, ticket choices, and final turns. Export/import JSON saves from the menu. The app shell and fonts are available offline after one online visit. Local saves belong to the browser in which you play.

## Development

Node 24 recommended.

```sh
npm ci
npm run dev
npm test
npm run build
```

`src/game/engine.ts` is a pure deterministic state machine. AI reads its own private cards and tickets plus public board information. The UI commits and saves transitions before decorative animation. All rules, AI, and storage tests run without a browser; browser verification covers actual device interactions and interrupted/repeated flows.

GitHub Actions tests and builds the app, then publishes only `dist` to GitHub Pages. Vite and the service worker use relative asset paths for a repository subpath.

This is an independent game inspired by classic railway rules. It is not affiliated with Ticket to Ride, Days of Wonder, or Asmodee. All graphic art and synthesized audio are original. Bundled DM Sans and Libre Caslon Display fonts use the SIL Open Font License; their notices are in `public/fonts`. No accounts or network multiplayer are included.
