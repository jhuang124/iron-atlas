import assert from 'node:assert/strict';
import test from 'node:test';
import { COLORS, ROUTES, SCORE_BY_LENGTH, TICKETS } from '../src/game/data';
import type { CardColor, Route } from '../src/game/data';
import { createGame, finalStandings, isTicketComplete, legalClaims, longestRoute, transition, validateState } from '../src/game/engine';
import type { GameAction, GameState } from '../src/game/types';

function fresh(count = 2, seed = 123): GameState {
  return createGame({ seed, players: Array.from({ length: count }, (_, index) => ({
    name: `Player ${index + 1}`, kind: index ? 'ai' : 'human', color: `color-${index}`,
  })) });
}

function act(state: GameState, action: GameAction): GameState {
  const result = transition(state, action);
  assert.equal(result.error, undefined, result.error);
  return result.state;
}

function started(count = 2, seed = 123): GameState {
  let state = fresh(count, seed);
  while (state.pendingTickets?.initial) {
    state = act(state, { type: 'keep-tickets', ticketIds: state.pendingTickets.ids.slice(0, 2) });
  }
  return state;
}

function allCards(): CardColor[] {
  return COLORS.flatMap(color => Array<CardColor>(color === 'wild' ? 14 : 12).fill(color));
}

/** Arrange real cards without creating or destroying any physical resource. */
function arrangeCards(state: GameState, hands: CardColor[][], market: CardColor[] = ['red', 'orange', 'yellow', 'green', 'blue'], discard: CardColor[] = []): void {
  const pool = allCards();
  const take = (cards: CardColor[]) => {
    for (const card of cards) {
      const index = pool.indexOf(card);
      assert.notEqual(index, -1, `Too many ${card} cards in fixture`);
      pool.splice(index, 1);
    }
    return [...cards];
  };
  state.players.forEach((player, index) => { player.hand = take(hands[index] ?? []); });
  state.market = take(market);
  state.discard = take(discard);
  state.deck = pool;
}

function markClaimed(state: GameState, route: Route, playerId = 0): void {
  state.claims[route.id] = playerId;
  state.players[playerId].trains -= route.length;
  state.players[playerId].score += SCORE_BY_LENGTH[route.length];
}

function assertValid(state: GameState): void {
  assert.deepEqual(validateState(state), { valid: true, errors: [] });
}

function routeBetween(from: string, to: string): Route {
  const route = ROUTES.find(route => (route.from === from && route.to === to) || (route.from === to && route.to === from));
  assert.ok(route, `Missing ${from}–${to} route`);
  return route;
}

test('seeded setup is repeatable, complete, and serializable', () => {
  const state = fresh(5, 0);
  assert.deepEqual(state, fresh(5, 0));
  assert.notDeepEqual(state.deck, fresh(5, 1).deck);
  assert.equal(state.players.length, 5);
  assert.ok(state.players.every(player => player.hand.length === 4 && player.trains === 45));
  assert.equal(state.market.length, 5);
  assert.equal(state.pendingTickets?.ids.length, 3);
  assertValid(JSON.parse(JSON.stringify(state)));
  assert.throws(() => fresh(1));
  assert.throws(() => fresh(6));
});

test('initial destinations require two, advance sequentially, and return rejected tickets to the bottom', () => {
  const initial = fresh(3);
  const offered = initial.pendingTickets!.ids;
  const rejected = transition(initial, { type: 'keep-tickets', ticketIds: offered.slice(0, 1) });
  assert.ok(rejected.error);
  assert.equal(rejected.state, initial);
  const snapshot = structuredClone(initial);
  const duplicate = transition(initial, { type: 'keep-tickets', ticketIds: [offered[0], offered[0]] });
  assert.ok(duplicate.error);
  assert.deepEqual(initial, snapshot);
  let state = act(initial, { type: 'keep-tickets', ticketIds: offered.slice(0, 2) });
  assert.equal(state.activePlayer, 1);
  assert.equal(state.ticketDeck.at(-1), offered[2]);
  assert.equal(state.turn, 0);
  while (state.pendingTickets?.initial) state = act(state, { type: 'keep-tickets', ticketIds: state.pendingTickets.ids });
  assert.equal(state.phase, 'turn');
  assert.equal(state.activePlayer, 0);
  assertValid(state);
});

test('drawing destinations uses the whole turn and requires one even with fewer than three left', () => {
  let state = started();
  const offered = state.ticketDeck.slice(0, 3);
  state = act(state, { type: 'draw-tickets' });
  assert.equal(state.phase, 'tickets');
  assert.ok(transition(state, { type: 'draw-card', source: 'deck' }).error);
  assert.ok(transition(state, { type: 'keep-tickets', ticketIds: [] }).error);
  state = act(state, { type: 'keep-tickets', ticketIds: offered.slice(0, 1) });
  assert.equal(state.turn, 1);
  assert.equal(state.activePlayer, 1);
  assert.deepEqual(state.ticketDeck.slice(-2), offered.slice(1));
  const remaining = state.ticketDeck.splice(0, state.ticketDeck.length - 1);
  state.players[0].tickets.push(...remaining);
  state = act(state, { type: 'draw-tickets' });
  assert.equal(state.pendingTickets!.ids.length, 1);
  state = act(state, { type: 'keep-tickets', ticketIds: state.pendingTickets!.ids });
  assertValid(state);
});

test('a face-up locomotive ends the turn; blind locomotives draw normally; a second face-up locomotive is illegal', () => {
  let state = started();
  arrangeCards(state, [[], []], ['wild', 'red', 'blue', 'green', 'black']);
  const before = structuredClone(state);
  state = act(state, { type: 'draw-card', source: 1 });
  assert.equal(state.phase, 'draw-second');
  assert.equal(state.players[0].hand[0], 'red');
  const illegal = transition(state, { type: 'draw-card', source: 0 });
  assert.ok(illegal.error);
  assert.equal(illegal.state, state);
  state = act(state, { type: 'draw-card', source: 'deck' });
  assert.equal(state.activePlayer, 1);
  assert.equal(state.players[0].hand.length, 2);
  assert.deepEqual(before.players[0].hand, []);
  state = act(state, { type: 'draw-card', source: 0 });
  assert.equal(state.phase, 'turn');
  assert.equal(state.activePlayer, 0);
  assert.equal(state.players[1].hand[0], 'wild');
  assertValid(state);

  state = started();
  arrangeCards(state, [[], []]);
  const index = state.deck.indexOf('wild');
  state.deck.push(...state.deck.splice(index, 1));
  state = act(state, { type: 'draw-card', source: 'deck' });
  assert.equal(state.players[0].hand[0], 'wild');
  assert.equal(state.phase, 'draw-second');
});

test('three-locomotive markets reset without losing cards, and impossible markets terminate', () => {
  let state = started();
  arrangeCards(state, [[], []], ['wild', 'wild', 'wild', 'red', 'blue']);
  state = act(state, { type: 'draw-card', source: 'deck' });
  assert.ok(state.market.filter(card => card === 'wild').length < 3);
  assert.ok(state.log.some(line => line.includes('market was refreshed')));
  assertValid(state);

  state = started();
  const regular = allCards().filter(card => card !== 'wild');
  arrangeCards(state, [[], [...regular, ...Array<CardColor>(4).fill('wild')]], Array<CardColor>(5).fill('wild'));
  state = act(state, { type: 'draw-card', source: 0 });
  assert.equal(state.phase, 'turn');
  assert.equal(state.market.length, 5);
  assert.ok(state.market.every(card => card === 'wild'));
  assertValid(state);
});

test('an empty deck recycles discards, and an unavailable second draw finishes gracefully', () => {
  let state = started();
  const market: CardColor[] = ['red', 'orange', 'yellow', 'green', 'blue'];
  const discard: CardColor[] = ['black', 'white'];
  const held = allCards();
  for (const card of [...market, ...discard]) held.splice(held.indexOf(card), 1);
  arrangeCards(state, [[], held], market, discard);
  assert.equal(state.deck.length, 0);
  state = act(state, { type: 'draw-card', source: 'deck' });
  assert.equal(state.discard.length, 0);
  assert.equal(state.deck.length, 1);
  assert.equal(state.phase, 'draw-second');
  assertValid(state);

  state = started();
  const everything = allCards();
  for (const card of ['green', 'wild', 'wild'] as CardColor[]) everything.splice(everything.indexOf(card), 1);
  arrangeCards(state, [[], everything], ['wild', 'wild']);
  assert.deepEqual(state.deck, ['green']);
  state = act(state, { type: 'draw-card', source: 'deck' });
  assert.equal(state.phase, 'turn');
  assert.equal(state.activePlayer, 1);
  assertValid(state);
});

test('gray routes require one color plus locomotives; payments and scoring are exact', () => {
  let state = started();
  const route = ROUTES.find(route => route.color === 'gray' && route.length >= 3)!;
  const hand: CardColor[] = ['red', 'blue', ...Array<CardColor>(route.length - 2).fill('wild')];
  arrangeCards(state, [hand, []]);
  assert.ok(transition(state, { type: 'claim-route', routeId: route.id, color: 'red', wilds: route.length - 2 }).error);
  arrangeCards(state, [['red', 'red', ...Array<CardColor>(route.length - 2).fill('wild')], []]);
  assert.ok(legalClaims(state).some(option => option.routeId === route.id && option.color === 'red' && option.wilds === route.length - 2));
  state = act(state, { type: 'claim-route', routeId: route.id, color: 'red', wilds: route.length - 2 });
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.players[0].trains, 45 - route.length);
  assert.equal(state.players[0].score, SCORE_BY_LENGTH[route.length]);
  assert.equal(state.claims[route.id], 0);
  assertValid(state);
});

test('colored routes reject the wrong color and accept an all-locomotive payment', () => {
  let state = started();
  const route = ROUTES.find(route => route.color !== 'gray' && route.length >= 2)!;
  const wrong = COLORS.find(color => color !== 'wild' && color !== route.color)!;
  arrangeCards(state, [Array<CardColor>(route.length).fill(wrong), []]);
  assert.ok(transition(state, { type: 'claim-route', routeId: route.id, color: wrong, wilds: 0 }).error);
  arrangeCards(state, [Array<CardColor>(route.length).fill('wild'), []]);
  state = act(state, { type: 'claim-route', routeId: route.id, color: 'wild', wilds: route.length });
  assert.equal(state.players[0].hand.length, 0);
  assertValid(state);
});

test('double routes lock both lanes in two or three players; four or five require different owners', () => {
  const first = ROUTES.find(route => route.parallelGroup)!;
  const second = ROUTES.find(route => route.id !== first.id && route.parallelGroup === first.parallelGroup)!;
  for (const count of [2, 3, 4, 5]) {
    const state = started(count);
    markClaimed(state, first);
    arrangeCards(state, Array.from({ length: count }, () => Array<CardColor>(second.length).fill('wild')));
    assert.equal(legalClaims(state, 0).some(option => option.routeId === second.id), false);
    assert.equal(legalClaims(state, 1).some(option => option.routeId === second.id), count >= 4);
    state.activePlayer = 1;
    const result = transition(state, { type: 'claim-route', routeId: second.id, color: 'wild', wilds: second.length });
    assert.equal(Boolean(result.error), count <= 3);
    assertValid(result.state);
  }
});

test('the trigger turn is followed by exactly one final turn for each player, including the trigger', () => {
  let state = started();
  const last = ROUTES.find(route => route.length === 1)!;
  const eligible = ROUTES.filter(route => route.id !== last.id && (!last.parallelGroup || route.parallelGroup !== last.parallelGroup));
  const distinct: Route[] = [];
  const groups = new Set<string>();
  for (const route of eligible) {
    if (route.parallelGroup && groups.has(route.parallelGroup)) continue;
    if (route.parallelGroup) groups.add(route.parallelGroup);
    distinct.push(route);
  }
  const sums = new Map<number, Route[]>([[0, []]]);
  for (const route of distinct) {
    for (const [sum, chosen] of [...sums]) if (sum + route.length <= 42 && !sums.has(sum + route.length)) sums.set(sum + route.length, [...chosen, route]);
  }
  assert.ok(sums.has(42));
  for (const route of sums.get(42)!) markClaimed(state, route);
  assert.equal(state.players[0].trains, 3);
  arrangeCards(state, [['wild'], []]);
  state = act(state, { type: 'claim-route', routeId: last.id, color: 'wild', wilds: 1 });
  assert.equal(state.finalTurnsRemaining, 2);
  assert.equal(state.activePlayer, 1);
  assertValid(state);
  state = act(state, { type: 'draw-card', source: 'deck' });
  state = act(state, { type: 'draw-card', source: 'deck' });
  assert.equal(state.finalTurnsRemaining, 1);
  assert.equal(state.activePlayer, 0);
  state = act(state, { type: 'draw-tickets' });
  assert.equal(state.finalTurnsRemaining, 1);
  state = act(state, { type: 'keep-tickets', ticketIds: state.pendingTickets!.ids.slice(0, 1) });
  assert.equal(state.finalTurnsRemaining, 0);
  assert.equal(state.phase, 'game-over');
  assert.equal(state.turn, 3);
  assertValid(state);
  assert.ok(transition(state, { type: 'draw-card', source: 'deck' }).error);
});

test('ticket completion follows owned connections and ignores opponents', () => {
  const state = started();
  const ticket = TICKETS[0];
  const queue = [ticket.from];
  const paths = new Map<string, Route[]>([[ticket.from, []]]);
  for (let i = 0; i < queue.length && !paths.has(ticket.to); i++) {
    for (const route of ROUTES.filter(route => route.from === queue[i] || route.to === queue[i])) {
      const city = route.from === queue[i] ? route.to : route.from;
      if (!paths.has(city)) { paths.set(city, [...paths.get(queue[i])!, route]); queue.push(city); }
    }
  }
  const path = paths.get(ticket.to)!;
  assert.ok(path.length);
  for (const route of path.slice(0, -1)) markClaimed(state, route);
  markClaimed(state, path.at(-1)!, 1);
  assert.equal(isTicketComplete(state, 0, ticket.id), false);
  state.claims[path.at(-1)!.id] = 0;
  assert.equal(isTicketComplete(state, 0, ticket.id), true);
  assert.equal(isTicketComplete(state, 0, 'does-not-exist'), false);
});

test('longest route includes cycles, revisits cities, and never reuses edges', () => {
  const state = started();
  const triangle = [routeBetween('denver', 'kansas-city'), routeBetween('denver', 'oklahoma-city'), routeBetween('kansas-city', 'oklahoma-city')];
  const branches = [routeBetween('kansas-city', 'omaha'), routeBetween('denver', 'santa-fe'), routeBetween('oklahoma-city', 'little-rock')];
  for (const route of triangle) markClaimed(state, route);
  const cycleLength = triangle.reduce((sum, route) => sum + route.length, 0);
  assert.equal(longestRoute(state, 0), cycleLength);
  for (const route of branches) markClaimed(state, route);
  // Completing the cycle returns to its entry city. Only one branch can be
  // appended without traversing a triangle edge twice; an open triangle path
  // can instead connect two branches after omitting the edge between them.
  const cycleAndBranch = cycleLength + Math.max(...branches.map(route => route.length));
  const openPaths = triangle.map(edge => cycleLength - edge.length + branches
    .filter(branch => [edge.from, edge.to].includes(branch.from) || [edge.from, edge.to].includes(branch.to))
    .reduce((sum, branch) => sum + branch.length, 0));
  assert.equal(longestRoute(state, 0), Math.max(cycleAndBranch, ...openPaths));
  assert.equal(longestRoute(state, 1), 0);
});

test('longest-route search matches an independent exhaustive trail search for varied graphs', () => {
  const reference = (routes: Route[]) => {
    const walk = (city: string, used: Set<string>): number => {
      let best = 0;
      for (const route of routes) {
        if (used.has(route.id) || (route.from !== city && route.to !== city)) continue;
        const next = new Set(used).add(route.id);
        best = Math.max(best, route.length + walk(route.from === city ? route.to : route.from, next));
      }
      return best;
    };
    return Math.max(0, ...routes.flatMap(route => [walk(route.from, new Set()), walk(route.to, new Set())]));
  };
  for (let seed = 1; seed <= 30; seed++) {
    const state = started(4, seed);
    const subset = ROUTES.filter((_, index) => ((index * 37 + seed * 19) % 17) < 2).slice(0, 10);
    for (const route of subset) markClaimed(state, route);
    assert.equal(longestRoute(state, 0), reference(subset), `graph ${seed}`);
  }
});

test('final scoring adds and subtracts destinations, awards tied longest bonuses, and ranks ties', () => {
  const state = started();
  state.players[0].tickets = [TICKETS[0].id];
  state.players[1].tickets = [TICKETS[0].id];
  const route = ROUTES[0];
  markClaimed(state, route, 0);
  const matching = ROUTES.find(other => other.length === route.length && other.id !== route.id)!;
  markClaimed(state, matching, 1);
  const scores = finalStandings(state);
  assert.equal(scores[0].longestBonus, 10);
  assert.equal(scores[1].longestBonus, 10);
  assert.equal(scores[0].ticketScore, -TICKETS[0].points);
  assert.equal(scores[0].totalScore, SCORE_BY_LENGTH[route.length] - TICKETS[0].points + 10);
  assert.equal(scores[0].rank, 1);
  assert.equal(scores[1].rank, 1);
});

test('completed destinations break score ties, then longest bonus ownership breaks the remaining ties', () => {
  const state = started(3);
  const ticket = TICKETS[0];
  const paths = new Map<string, Route[]>([[ticket.from, []]]);
  const queue = [ticket.from];
  for (let index = 0; index < queue.length && !paths.has(ticket.to); index++) {
    for (const route of ROUTES.filter(route => route.from === queue[index] || route.to === queue[index])) {
      const city = route.from === queue[index] ? route.to : route.from;
      if (!paths.has(city)) { paths.set(city, [...paths.get(queue[index])!, route]); queue.push(city); }
    }
  }
  for (const route of paths.get(ticket.to)!) markClaimed(state, route);
  state.players[0].tickets = [ticket.id];
  state.players[1].tickets = [ticket.id];
  state.players[2].tickets = [];
  state.players[0].score = 0;
  state.players[1].score = ticket.points * 2 + 10;
  let scores = finalStandings(state);
  const winner = scores.find(standing => standing.playerId === 0)!;
  const loser = scores.find(standing => standing.playerId === 1)!;
  assert.equal(winner.ticketScore, ticket.points);
  assert.equal(loser.ticketScore, -ticket.points);
  assert.equal(winner.totalScore, loser.totalScore);
  assert.equal(winner.rank, 1);
  assert.equal(loser.rank, 2);

  // Both players complete zero tickets, with equal totals; only player 0 has
  // the globally longest trail, so the bonus card resolves this tie.
  state.players.forEach(player => { player.tickets = []; player.score = 0; });
  state.players[1].score = 10;
  scores = finalStandings(state);
  assert.equal(scores[0].playerId, 0);
  assert.equal(scores[0].rank, 1);
  assert.equal(scores.find(standing => standing.playerId === 1)!.rank, 2);

  // Comparing local trail lengths is not another tiebreaker: neither of these
  // two players possesses the longest-route card, so their tied totals stand.
  state.claims = {};
  const lengths = [1, 2, 6];
  lengths.forEach((length, id) => { state.claims[ROUTES.find(route => route.length === length)!.id] = id; });
  state.players[0].score = 5;
  state.players[1].score = 5;
  state.players[2].score = 100;
  scores = finalStandings(state);
  assert.equal(scores[0].playerId, 2);
  assert.equal(scores.find(standing => standing.playerId === 0)!.rank, 2);
  assert.equal(scores.find(standing => standing.playerId === 1)!.rank, 2);
});

test('pass is rejected while any action is available and allowed for a player with no action', () => {
  let state = started();
  assert.ok(transition(state, { type: 'pass' }).error);
  state.players[0].tickets.push(...state.ticketDeck.splice(0));
  arrangeCards(state, [[], allCards()], []);
  state = act(state, { type: 'pass' });
  assert.equal(state.activePlayer, 1);
  assert.equal(state.phase, 'turn');
  assertValid(state);
});

test('saved-state validation rejects tampered resources, impossible ownership, and malformed input', () => {
  const state = started();
  assertValid(state);
  const malformed: unknown[] = [null, [], {}, { ...state, players: [null, null] }, { ...state, pendingTickets: undefined }];
  for (const value of malformed) assert.equal(validateState(value).valid, false);
  const variants: GameState[] = [];
  let changed = structuredClone(state); changed.players[0].hand.push('wild'); variants.push(changed);
  changed = structuredClone(state); changed.players[0].tickets.push(changed.players[1].tickets[0]); variants.push(changed);
  changed = structuredClone(state); changed.players[0].trains--; variants.push(changed);
  changed = structuredClone(state); changed.players[0].score++; variants.push(changed);
  changed = structuredClone(state); changed.rng = -1; variants.push(changed);
  changed = structuredClone(state); changed.activePlayer = 5; variants.push(changed);
  changed = structuredClone(state); changed.claims.unknown = 0; variants.push(changed);
  const first = ROUTES.find(route => route.parallelGroup)!;
  const second = ROUTES.find(route => route.id !== first.id && route.parallelGroup === first.parallelGroup)!;
  changed = structuredClone(state); markClaimed(changed, first); markClaimed(changed, second, 1); variants.push(changed);
  for (const value of variants) assert.equal(validateState(value).valid, false);
});

test('validation never derives legal actions from malformed finished saves or throws on unknown input', () => {
  const state = started();
  const malformedFinish = {
    ...state, phase: 'game-over', finalTurnsRemaining: 0,
    market: [], deck: [], discard: [], ticketDeck: [],
    players: [{ ...state.players[0], id: 1 }, { ...state.players[1], hand: null }],
  };
  assert.doesNotThrow(() => validateState(malformedFinish));
  const result = validateState(malformedFinish);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Invalid player identity.'));
  assert.ok(result.errors.includes('Invalid player hand.'));
  const unreadable = new Proxy({}, { get() { throw new Error('Unreadable input'); } });
  assert.doesNotThrow(() => validateState(unreadable));
  assert.equal(validateState(unreadable).valid, false);
  assertValid(state);
});
