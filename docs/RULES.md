# Iron Atlas rules reference

Iron Atlas uses the classic North America game, pinned to the [official 2015 English reprint](https://ncdn0.daysofwonder.com/tickettoride/en/img/tt_rules_2015_en.pdf). Verified September 30, 2026. Interface, coordinates, typography, and SVG artwork are original; publisher graphics are not included.

## Edition evidence

Classic setup: **30 tickets**, **four opening train cards**, **three opening tickets, keeping at least two**, and **45 trains per player**. The 110 train cards contain twelve of each color and fourteen locomotives. [Official classic PDF, page 2](https://ncdn0.daysofwonder.com/tickettoride/en/img/tt_rules_2015_en.pdf).

The [product page](https://www.daysofwonder.com/game/ticket-to-ride/) links **Old Rules All**. The archive's English member, `7201-T2R-Rules-EN-20240423_LOWRES.pdf` (copyright 2004–2024), confirms this setup. [Official rulebooks ZIP](https://cdn.svc.asmodee.net/production-daysofwonder/uploads/2025/07/old_rules_TTR_USA.zip).

The [2025 rulebook](https://cdn.svc.asmodee.net/production-daysofwonder/uploads/2025/07/7201N_TICKET2RIDEV2_RULES_EN_20250425_WEB.pdf), page 2, instead lists **33 tickets** and deals **four opening tickets**, keeping at least two. Those edition changes are excluded here. USA 1910 expansion tickets and variants are also excluded.

## Turn and scoring rules

- Choose one: draw train cards, claim one route, or draw tickets.
- Draw up to two cards. A face-up locomotive consumes the action and cannot be the second draw; a blind locomotive counts as one. Replace market draws immediately. Three visible locomotives discard and replace the whole market. Reshuffle train discards as needed.
- Pay a matching color plus optional locomotives. Gray accepts any single color. Claims need sufficient cards and trains, without requiring an existing connection.
- **2–3 players:** claiming a double-route lane closes its sibling. **4–5 players:** different players may claim both. Nobody may own both lanes.
- Later ticket draws offer three, or fewer if depleted. Keep at least one; return others beneath the deck. Retained tickets stay secret and cannot be discarded.

These mechanics are stated in [the archived classic rulebook, pages 3–4](https://cdn.svc.asmodee.net/production-daysofwonder/uploads/2025/07/old_rules_TTR_USA.zip).

Route lengths 1–6 score **1, 2, 4, 7, 10, 15**. Completed tickets add their printed values; unfinished tickets subtract them. At a turn's end, **0–2 remaining trains** triggers one more turn for every player, including the triggering player. Longest continuous path earns **10 points**, shared by all tied players. A path may revisit cities and include loops, but cannot reuse a train: the graph calculation is a longest trail, not a sum of the connected network. Score ties resolve by completed ticket count, then possession of the longest-path bonus. [Official classic PDF, page 4](https://ncdn0.daysofwonder.com/tickettoride/en/img/tt_rules_2015_en.pdf).

## Data checks and implementation notes

`src/game/data.ts` contains 36 cities, 100 separately claimable lanes, 78 distinct city pairs, 22 double-route pairs, and the original 30 destination tickets. Validation checks unique IDs, endpoint references, equal-length grouped lanes, and a connected map. Route spaces total 309; 44 lanes are gray and each of the eight colored route types has seven lanes. Coordinates use an original 1000 × 650 layout.

Parallel lanes share `parallelGroup`; they remain distinct edges for ownership and trail scoring. `wild` denotes a locomotive card and `gray` denotes a neutral route. Ticket completion uses only the player's own claimed routes. Keep classic ticket values, including Los Angeles–New York 21, Seattle–New York 22, and Vancouver–Montréal 20.

The classic text does not explicitly resolve an otherwise complete tie after its two tie-breakers, nor a pathological market that can only refill with three or more locomotives. Any shared-victory handling or bounded market-refresh protection is an implementation resolution, not an additional classic scoring rule.
