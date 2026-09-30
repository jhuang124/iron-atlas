import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAIAction } from '../src/game/ai';
import type { AIDifficulty } from '../src/game/ai';
import { COLORS, ROUTES, TICKETS } from '../src/game/data';
import { createGame, finalStandings, transition } from '../src/game/engine';
import type { GameState } from '../src/game/types';

const difficulties: AIDifficulty[] = ['relaxed', 'standard', 'expert'];
const playerColors = ['#ffac6e', '#60c9c2', '#bc9aff', '#77b2fa', '#edcf6c'];

function seededGame(count: number, seed: number): GameState {
  return createGame({
    players: Array.from({ length: count }, (_, index) => ({
      name: `AI ${index + 1}`, kind: 'ai' as const, color: playerColors[index],
    })),
    seed,
  });
}

function assertConservation(state: GameState): void {
  const cards = [...state.deck, ...state.discard, ...state.market, ...state.players.flatMap(player => player.hand)];
  assert.equal(cards.length, 110, 'all train cards remain accounted for');
  for (const color of COLORS) {
    assert.equal(cards.filter(card => card === color).length, color === 'wild' ? 14 : 12, `${color} card conservation`);
  }
  const tickets = [...state.ticketDeck, ...(state.pendingTickets?.ids ?? []), ...state.players.flatMap(player => player.tickets)];
  assert.equal(tickets.length, TICKETS.length, 'all destination cards remain accounted for');
  assert.equal(new Set(tickets).size, TICKETS.length, 'destination cards never duplicate');
  for (const player of state.players) {
    const used = ROUTES.filter(route => state.claims[route.id] === player.id).reduce((sum, route) => sum + route.length, 0);
    assert.equal(player.trains + used, 45, 'train pieces remain accounted for');
  }
}

for (const difficulty of difficulties) {
  for (const count of [2, 3, 4, 5]) {
    test(`${difficulty} AI completes a seeded ${count}-player game with legal actions`, () => {
      let state = seededGame(count, 8300 + count * 31 + difficulties.indexOf(difficulty) * 177);
      let actionCount = 0;
      const repeated = new Map<string, number>();
      while (state.phase !== 'game-over' && actionCount < 1800) {
        const action = chooseAIAction(state, difficulty);
        assert.ok(action, `an action exists in ${state.phase}`);
        assert.deepEqual(action, chooseAIAction(state, difficulty), 'selection is deterministic');
        const result = transition(state, action);
        assert.equal(result.error, undefined, `${JSON.stringify(action)} is legal on turn ${state.turn}: ${result.error}`);
        assert.notDeepEqual(result.state, state, 'the action changes game state');
        state = result.state;
        assertConservation(state);
        // A structural position can briefly repeat during card collection, but
        // sustained repetitions indicate an AI stuck drawing without a plan.
        const position = JSON.stringify([state.activePlayer, state.phase, state.claims, state.players.map(player => player.hand)]);
        const times = (repeated.get(position) ?? 0) + 1;
        repeated.set(position, times);
        assert.ok(times < 8, 'AI does not cycle through identical positions');
        actionCount++;
      }
      assert.equal(state.phase, 'game-over', `the game finishes within ${actionCount} actions`);
      const standings = finalStandings(state);
      assert.equal(standings.length, count);
      assert.ok(standings.every(standing => Number.isFinite(standing.totalScore)));
      assert.ok(standings.some(standing => standing.completedTickets > 0), 'route planning completes destinations');
      assert.equal(chooseAIAction(state, difficulty), null);
    });
  }
}

test('AI decisions never depend on concealed opponent cards or undealt cards', () => {
  let state = seededGame(4, 90210);
  while (state.phase === 'tickets') {
    const action = chooseAIAction(state, 'expert');
    assert.ok(action);
    state = transition(state, action).state;
  }
  for (let step = 0; step < 35; step++) {
    const hiddenChanged: GameState = {
      ...state,
      rng: state.rng ^ 123456,
      deck: state.deck.map(() => 'red'),
      ticketDeck: [...state.ticketDeck].reverse(),
      players: state.players.map(player => player.id === state.activePlayer ? player : {
        ...player, hand: player.hand.map(() => 'wild'), tickets: [...player.tickets].reverse(),
      }),
    };
    for (const difficulty of difficulties) {
      assert.deepEqual(chooseAIAction(state, difficulty), chooseAIAction(hiddenChanged, difficulty));
    }
    const action = chooseAIAction(state, 'expert');
    assert.ok(action);
    state = transition(state, action).state;
  }
});

test('a second draw never selects a visible locomotive', () => {
  const state = seededGame(2, 713);
  const drawing: GameState = { ...state, phase: 'draw-second', pendingTickets: null, market: ['wild', 'wild', 'blue', 'wild', 'wild'] };
  for (const difficulty of difficulties) {
    const action = chooseAIAction(drawing, difficulty);
    assert.ok(action?.type === 'draw-card');
    if (typeof action.source === 'number') assert.notEqual(drawing.market[action.source], 'wild');
  }
});

test('opening destinations meet the required keep count', () => {
  for (const difficulty of difficulties) {
    const state = seededGame(5, 193 + difficulties.indexOf(difficulty));
    const action = chooseAIAction(state, difficulty);
    assert.ok(action?.type === 'keep-tickets');
    assert.ok(action.ticketIds.length >= state.pendingTickets!.minKeep);
    assert.ok(action.ticketIds.every(id => state.pendingTickets!.ids.includes(id)));
    assert.equal(transition(state, action).error, undefined);
  }
});

test('the final round prioritizes completing a valuable destination', () => {
  const state = seededGame(2, 1776);
  const owned = ['seattle-helena', 'helena-duluth', 'duluth-chicago', 'chicago-pittsburgh-1'];
  const position: GameState = {
    ...state, phase: 'turn', pendingTickets: null, finalTurnsRemaining: 2,
    claims: Object.fromEntries(owned.map(routeId => [routeId, 0])),
    players: state.players.map((player, index) => index ? player : {
      ...player, trains: 27, tickets: ['seattle-new-york'],
      hand: COLORS.filter(color => color !== 'wild').flatMap(color => Array(6).fill(color)),
    }),
  };
  for (const difficulty of difficulties) {
    const action = chooseAIAction(position, difficulty);
    assert.ok(action?.type === 'claim-route');
    assert.ok(['new-york-pittsburgh-1', 'new-york-pittsburgh-2'].includes(action.routeId));
    assert.equal(transition(position, action).error, undefined);
  }
});

test('AI takes a visible card that completes its planned payment', () => {
  const state = seededGame(2, 1901);
  const position: GameState = {
    ...state, phase: 'turn', pendingTickets: null,
    claims: { 'denver-santa-fe': 0 }, market: ['white', 'wild', 'blue', 'black', 'purple'],
    players: state.players.map((player, index) => index ? player : {
      ...player, trains: 43, tickets: ['denver-el-paso'], hand: ['blue'],
    }),
  };
  for (const difficulty of difficulties) {
    assert.deepEqual(chooseAIAction(position, difficulty), { type: 'draw-card', source: 2 });
  }
});
