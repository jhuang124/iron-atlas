import { CITIES, COLORS, ROUTES, SCORE_BY_LENGTH, TICKETS } from './data';
import type { CardColor, Route } from './data';
import type {
  ClaimOption, FinalStanding, GameAction, GameConfig, GameState,
  TransitionResult, ValidationResult,
} from './types';

const routeById = new Map(ROUTES.map(route => [route.id, route]));
const ticketById = new Map(TICKETS.map(ticket => [ticket.id, ticket]));
const colorSet = new Set<string>(COLORS);
const regularColors = COLORS.filter(color => color !== 'wild');
const CARD_TOTAL = 110;

function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(state: GameState, values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(random(state) * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function drawBlind(state: GameState): CardColor | undefined {
  if (!state.deck.length && state.discard.length) {
    state.deck = shuffle(state, state.discard);
    state.discard = [];
  }
  return state.deck.pop();
}

function wildCount(cards: CardColor[]): number {
  return cards.filter(card => card === 'wild').length;
}

/** Rejection sampling is bounded, including the case where a valid market is impossible. */
function refillMarket(state: GameState): void {
  let resets = 0;
  while (true) {
    while (state.market.length < 5) {
      const card = drawBlind(state);
      if (!card) break;
      state.market.push(card);
    }
    if (wildCount(state.market) < 3) break;
    const pool = [...state.market, ...state.deck, ...state.discard];
    const needed = Math.min(5, pool.length) - 2;
    // If all remaining cards make a valid five-card market impossible, retain
    // the available cards. Players may still draw them; never loop indefinitely.
    if (pool.filter(card => card !== 'wild').length < needed) break;
    if (resets++ >= 32) {
      // A deterministic finite fallback for an exceptionally unlucky shuffle.
      // It preserves every card and still offers a legal market.
      shuffle(state, pool);
      const selected: CardColor[] = [];
      for (let i = pool.length - 1; i >= 0 && selected.length < needed; i--) {
        if (pool[i] !== 'wild') selected.push(...pool.splice(i, 1));
      }
      const target = Math.min(5, selected.length + pool.length);
      while (selected.length < target) {
        selected.push(pool.pop()!);
      }
      state.market = shuffle(state, selected);
      state.deck = pool;
      state.discard = [];
      break;
    }
    state.discard.push(...state.market);
    state.market = [];
  }
  if (resets) state.log.push('The market was refreshed after three locomotives appeared.');
}

function hasAvailableDraw(state: GameState, second = false): boolean {
  return state.deck.length + state.discard.length > 0
    || state.market.some(card => !second || card !== 'wild');
}

function finishTurn(state: GameState): void {
  const player = state.players[state.activePlayer];
  state.turn++;
  state.pendingTickets = null;
  if (state.finalTurnsRemaining === null && player.trains <= 2) {
    state.finalTurnsRemaining = state.players.length;
    state.log.push(`${player.name} has ${player.trains} trains left. Everyone gets one final turn.`);
  } else if (state.finalTurnsRemaining !== null) {
    state.finalTurnsRemaining--;
  }
  if (state.finalTurnsRemaining === 0) {
    state.phase = 'game-over';
    state.log.push('The last turn is complete. Destination tickets and the longest route are scored.');
    return;
  }
  state.activePlayer = (state.activePlayer + 1) % state.players.length;
  state.phase = 'turn';
}

export function createGame(config: GameConfig): GameState {
  if (!config || !Array.isArray(config.players) || config.players.length < 2 || config.players.length > 5) {
    throw new Error('Choose between two and five players.');
  }
  if (!Number.isFinite(config.seed)) throw new Error('The game seed must be a finite number.');
  if (config.players.some(player => !player || typeof player.name !== 'string'
    || !player.name.trim() || player.name.length > 80
    || !['human', 'ai'].includes(player.kind)
    || typeof player.color !== 'string' || !player.color || player.color.length > 80)) {
    throw new Error('Each player needs a name, a valid kind, and a color.');
  }
  const state: GameState = {
    version: 1, rng: config.seed >>> 0,
    players: config.players.map((player, id) => ({
      ...player, id, name: player.name.trim(), hand: [], tickets: [], trains: 45, score: 0,
    })),
    activePlayer: 0, phase: 'tickets', pendingTickets: null,
    deck: [], discard: [], market: [], ticketDeck: [], claims: {},
    finalTurnsRemaining: null, turn: 0, log: ['A new journey begins.'],
  };
  for (const color of COLORS) {
    state.deck.push(...Array<CardColor>(color === 'wild' ? 14 : 12).fill(color));
  }
  shuffle(state, state.deck);
  state.ticketDeck = shuffle(state, TICKETS.map(ticket => ticket.id));
  for (const player of state.players) {
    for (let i = 0; i < 4; i++) player.hand.push(drawBlind(state)!);
  }
  refillMarket(state);
  state.pendingTickets = {
    playerId: 0, ids: state.ticketDeck.splice(0, 3), minKeep: 2, initial: true,
  };
  return state;
}

function laneAvailable(state: GameState, route: Route, playerId: number): boolean {
  if (Object.hasOwn(state.claims, route.id)) return false;
  if (!route.parallelGroup) return true;
  return !ROUTES.some(sibling => sibling.id !== route.id
    && sibling.parallelGroup === route.parallelGroup
    && Object.hasOwn(state.claims, sibling.id)
    && (state.players.length <= 3 || state.claims[sibling.id] === playerId));
}

export function legalClaims(state: GameState, playerId = state.activePlayer): ClaimOption[] {
  const player = state.players[playerId];
  if (!player || state.phase === 'game-over') return [];
  const counts = Object.fromEntries(COLORS.map(color => [color, 0])) as Record<CardColor, number>;
  for (const card of player.hand) counts[card]++;
  const options: ClaimOption[] = [];
  for (const route of ROUTES) {
    if (route.length > player.trains || !laneAvailable(state, route, playerId)) continue;
    const colors = route.color === 'gray' ? regularColors : [route.color];
    for (const color of colors) {
      for (let wilds = 0; wilds < route.length; wilds++) {
        if (counts.wild >= wilds && counts[color] >= route.length - wilds) {
          options.push({ routeId: route.id, color, wilds, length: route.length, points: SCORE_BY_LENGTH[route.length] });
        }
      }
    }
    if (counts.wild >= route.length) {
      options.push({ routeId: route.id, color: 'wild', wilds: route.length,
        length: route.length, points: SCORE_BY_LENGTH[route.length] });
    }
  }
  return options;
}

/** Rejected actions return the original object and cannot mutate it. */
export function transition(original: GameState, action: GameAction): TransitionResult {
  const reject = (error: string): TransitionResult => ({ state: original, error });
  if (!action || typeof action !== 'object') return reject('Choose a valid action.');
  if (original.phase === 'game-over') return reject('This game is finished.');
  const state: GameState = structuredClone(original);
  const player = state.players[state.activePlayer];
  if (action.type === 'keep-tickets') {
    const pending = state.pendingTickets;
    if (state.phase !== 'tickets' || !pending) return reject('There are no destination tickets to choose.');
    if (!Array.isArray(action.ticketIds) || action.ticketIds.some(id => typeof id !== 'string')
      || new Set(action.ticketIds).size !== action.ticketIds.length
      || action.ticketIds.some(id => !pending.ids.includes(id))) {
      return reject('Choose only the destination tickets offered, without duplicates.');
    }
    if (action.ticketIds.length < pending.minKeep) return reject(`Keep at least ${pending.minKeep} destination tickets.`);
    player.tickets.push(...action.ticketIds);
    state.ticketDeck.push(...pending.ids.filter(id => !action.ticketIds.includes(id)));
    state.log.push(`${player.name} kept ${action.ticketIds.length} destination ticket${action.ticketIds.length === 1 ? '' : 's'}.`);
    if (pending.initial && state.activePlayer < state.players.length - 1) {
      state.activePlayer++;
      state.pendingTickets = {
        playerId: state.activePlayer, ids: state.ticketDeck.splice(0, 3), minKeep: 2, initial: true,
      };
    } else if (pending.initial) {
      state.activePlayer = 0;
      state.phase = 'turn';
      state.pendingTickets = null;
    } else {
      finishTurn(state);
    }
    return { state };
  }
  if (state.phase === 'tickets') return reject('Choose your destination tickets before continuing.');
  if (action.type === 'draw-card') {
    if (state.phase !== 'turn' && state.phase !== 'draw-second') return reject('You cannot draw a card now.');
    const second = state.phase === 'draw-second';
    let card: CardColor | undefined;
    let faceUp = false;
    if (action.source === 'deck') {
      card = drawBlind(state);
      if (!card) return reject('The draw pile and discard pile are empty.');
    } else {
      if (!Number.isInteger(action.source) || action.source < 0 || action.source >= state.market.length) {
        return reject('Choose an available face-up card.');
      }
      card = state.market[action.source];
      if (second && card === 'wild') return reject('A face-up locomotive must be your only draw this turn.');
      state.market.splice(action.source, 1);
      faceUp = true;
    }
    player.hand.push(card);
    state.log.push(`${player.name} drew ${faceUp ? (card === 'wild' ? 'a locomotive' : `a ${card} card`) : 'a card from the deck'}.`);
    refillMarket(state);
    if (second || (faceUp && card === 'wild') || !hasAvailableDraw(state, true)) finishTurn(state);
    else state.phase = 'draw-second';
    return { state };
  }
  if (state.phase === 'draw-second') return reject('Finish drawing your second train card.');
  if (action.type === 'claim-route') {
    const route = routeById.get(action.routeId);
    if (!route) return reject('That route does not exist.');
    if (!laneAvailable(state, route, player.id)) return reject('That route is claimed or its parallel lane is unavailable.');
    if (route.length > player.trains) return reject('You do not have enough train pieces for that route.');
    if (!Number.isInteger(action.wilds) || action.wilds < 0 || !colorSet.has(action.color)) {
      return reject('Choose a valid train-card payment.');
    }
    if (!legalClaims(state).some(option => option.routeId === action.routeId
      && option.color === action.color && option.wilds === action.wilds)) {
      return reject('Pay the route length with one matching color and any chosen locomotives.');
    }
    let coloredRemaining = route.length - action.wilds;
    let wildsRemaining = action.wilds;
    player.hand = player.hand.filter(card => {
      if (card === 'wild' && wildsRemaining > 0) {
        wildsRemaining--;
        state.discard.push(card);
        return false;
      }
      if (card === action.color && coloredRemaining > 0) {
        coloredRemaining--;
        state.discard.push(card);
        return false;
      }
      return true;
    });
    state.claims[route.id] = player.id;
    player.trains -= route.length;
    player.score += SCORE_BY_LENGTH[route.length];
    const cityName = (id: string) => CITIES.find(city => city.id === id)?.name ?? id;
    state.log.push(`${player.name} claimed ${cityName(route.from)}–${cityName(route.to)} for ${SCORE_BY_LENGTH[route.length]} points.`);
    refillMarket(state);
    finishTurn(state);
    return { state };
  }
  if (action.type === 'draw-tickets') {
    if (!state.ticketDeck.length) return reject('There are no destination tickets left.');
    state.pendingTickets = {
      playerId: player.id, ids: state.ticketDeck.splice(0, 3), minKeep: 1, initial: false,
    };
    state.phase = 'tickets';
    return { state };
  }
  if (action.type === 'pass') {
    if (hasAvailableDraw(state) || state.ticketDeck.length || legalClaims(state).length) {
      return reject('Pass only when no train cards, destination tickets, or affordable routes are available.');
    }
    state.log.push(`${player.name} passed because no action was available.`);
    if (state.players.every(other => legalClaims(state, other.id).length === 0)) {
      state.turn++;
      state.finalTurnsRemaining = 0;
      state.phase = 'game-over';
      state.log.push('No player has an available action. The journey is scored.');
      return { state };
    }
    finishTurn(state);
    return { state };
  }
  return reject('Choose a valid action.');
}

export function isTicketComplete(state: GameState, playerId: number, ticketId: string): boolean {
  const ticket = ticketById.get(ticketId);
  if (!ticket || !state.players[playerId]) return false;
  const adjacency = new Map<string, string[]>();
  for (const route of ROUTES) {
    if (state.claims[route.id] !== playerId) continue;
    adjacency.set(route.from, [...(adjacency.get(route.from) ?? []), route.to]);
    adjacency.set(route.to, [...(adjacency.get(route.to) ?? []), route.from]);
  }
  const visited = new Set([ticket.from]);
  const queue = [ticket.from];
  for (let index = 0; index < queue.length; index++) {
    if (queue[index] === ticket.to) return true;
    for (const city of adjacency.get(queue[index]) ?? []) {
      if (!visited.has(city)) { visited.add(city); queue.push(city); }
    }
  }
  return false;
}

/** Exact maximum edge-simple trail: cities can repeat, each owned route can be used once. */
export function longestRoute(state: GameState, playerId: number): number {
  const routes = ROUTES.filter(route => state.claims[route.id] === playerId);
  if (!routes.length) return 0;
  type Edge = { to: string; index: number; length: number; bit: bigint };
  const adjacency = new Map<string, Edge[]>();
  routes.forEach((route, index) => {
    const bit = 1n << BigInt(index);
    adjacency.set(route.from, [...(adjacency.get(route.from) ?? []), { to: route.to, index, length: route.length, bit }]);
    adjacency.set(route.to, [...(adjacency.get(route.to) ?? []), { to: route.from, index, length: route.length, bit }]);
  });
  let best = 0;
  const visited = new Set<string>();
  const search = (city: string, used: bigint, length: number): void => {
    best = Math.max(best, length);
    const key = `${city}:${used}`;
    if (visited.has(key)) return;
    visited.add(key);
    const reachable = new Set([city]);
    const queue = [city];
    let remaining = 0;
    let edgeMask = 0n;
    const degrees = new Map<string, number>();
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      for (const edge of adjacency.get(current) ?? []) {
        if (used & edge.bit) continue;
        degrees.set(current, (degrees.get(current) ?? 0) + 1);
        if (!(edgeMask & edge.bit)) { edgeMask |= edge.bit; remaining += edge.length; }
        if (!reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to); }
      }
    }
    if (length + remaining <= best) return;
    const odd = [...degrees].filter(([, degree]) => degree % 2).map(([vertex]) => vertex);
    if (odd.length === 0 || (odd.length === 2 && odd.includes(city))) {
      best = Math.max(best, length + remaining);
      return;
    }
    const available = (adjacency.get(city) ?? []).filter(edge => !(used & edge.bit));
    available.sort((a, b) => b.length - a.length);
    for (const edge of available) search(edge.to, used | edge.bit, length + edge.length);
  };
  // Leaves/odd vertices first find a strong bound quickly; all starts are explored.
  const starts = [...adjacency.keys()].sort((a, b) => (adjacency.get(a)!.length % 2 ? 0 : 1) - (adjacency.get(b)!.length % 2 ? 0 : 1));
  for (const city of starts) search(city, 0n, 0);
  return best;
}

export function finalStandings(state: GameState): FinalStanding[] {
  const lengths = state.players.map(player => longestRoute(state, player.id));
  const maximum = Math.max(...lengths);
  const standings = state.players.map(player => {
    const ticketResults = player.tickets.map(ticketId => {
      const complete = isTicketComplete(state, player.id, ticketId);
      const points = ticketById.get(ticketId)?.points ?? 0;
      return { ticketId, complete, points: complete ? points : -points };
    });
    const ticketScore = ticketResults.reduce((sum, ticket) => sum + ticket.points, 0);
    const longestBonus = lengths[player.id] === maximum ? 10 : 0;
    return {
      playerId: player.id, name: player.name, routeScore: player.score, ticketScore,
      completedTickets: ticketResults.filter(ticket => ticket.complete).length,
      totalTickets: player.tickets.length, longestRoute: lengths[player.id], longestBonus,
      totalScore: player.score + ticketScore + longestBonus, rank: 0, ticketResults,
    };
  });
  standings.sort((a, b) => b.totalScore - a.totalScore
    || b.completedTickets - a.completedTickets || b.longestBonus - a.longestBonus
    || a.playerId - b.playerId);
  for (let i = 0; i < standings.length; i++) {
    const previous = standings[i - 1];
    const current = standings[i];
    current.rank = previous && previous.totalScore === current.totalScore
      && previous.completedTickets === current.completedTickets
      && previous.longestBonus === current.longestBonus ? previous.rank : i + 1;
  }
  return standings;
}

/** Validates saved JSON structurally and against physical cards, tickets, and board rules. */
export function validateState(value: unknown): ValidationResult {
  try {
    return validateSavedState(value);
  } catch {
    // This API accepts unknown input, including objects with unreadable fields.
    // Loading such an object must fail safely instead of crashing the game.
    return { valid: false, errors: ['Save data contains unreadable or malformed fields.'] };
  }
}

function validateSavedState(value: unknown): ValidationResult {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['Save data must be an object.'] };
  const state = value as GameState;
  if (state.version !== 1) fail('Unsupported save version.');
  const integer = (number: unknown, min: number, max = Number.MAX_SAFE_INTEGER) => typeof number === 'number' && Number.isSafeInteger(number) && number >= min && number <= max;
  if (!integer(state.rng, 0, 0xffffffff)) fail('Invalid random-generator state.');
  if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 5) {
    fail('A game must contain two to five players.');
    return { valid: false, errors };
  }
  if (!integer(state.activePlayer, 0, state.players.length - 1)) fail('Invalid active player.');
  if (!['tickets', 'turn', 'draw-second', 'game-over'].includes(state.phase)) fail('Invalid game phase.');
  if (!integer(state.turn, 0)) fail('Invalid turn count.');
  if (!Array.isArray(state.log) || state.log.some(line => typeof line !== 'string' || line.length > 2000) || state.log.length > 100000) fail('Invalid game log.');
  if (state.finalTurnsRemaining !== null && !integer(state.finalTurnsRemaining, 0, state.players.length)) fail('Invalid final-round counter.');
  if (!state.claims || typeof state.claims !== 'object' || Array.isArray(state.claims)) fail('Invalid route claims.');
  const claims = state.claims && typeof state.claims === 'object' && !Array.isArray(state.claims) ? state.claims : {};
  for (const [routeId, owner] of Object.entries(claims)) {
    if (!routeById.has(routeId) || !integer(owner, 0, state.players.length - 1)) fail('A route claim has an invalid route or owner.');
  }
  const cards: unknown[] = [];
  const tickets: unknown[] = [];
  const cardArray = (array: unknown, name: string) => {
    if (!Array.isArray(array) || array.length > CARD_TOTAL || array.some(card => typeof card !== 'string' || !colorSet.has(card))) fail(`Invalid ${name}.`);
    else cards.push(...array);
  };
  cardArray(state.deck, 'draw pile'); cardArray(state.discard, 'discard pile'); cardArray(state.market, 'market');
  if (Array.isArray(state.market) && state.market.length > 5) fail('The market has more than five cards.');
  const ticketArray = (array: unknown, name: string) => {
    if (!Array.isArray(array) || array.length > TICKETS.length || array.some(id => typeof id !== 'string' || !ticketById.has(id))) fail(`Invalid ${name}.`);
    else tickets.push(...array);
  };
  ticketArray(state.ticketDeck, 'destination deck');
  for (let index = 0; index < state.players.length; index++) {
    const player = state.players[index];
    if (!player || typeof player !== 'object' || Array.isArray(player)) { fail('Invalid player.'); continue; }
    if (player.id !== index || !['human', 'ai'].includes(player.kind)
      || typeof player.name !== 'string' || !player.name.trim() || player.name.length > 80
      || typeof player.color !== 'string' || !player.color || player.color.length > 80) fail('Invalid player identity.');
    cardArray(player.hand, 'player hand'); ticketArray(player.tickets, 'player destinations');
    const routes = ROUTES.filter(route => claims[route.id] === index);
    const trainCount = 45 - routes.reduce((sum, route) => sum + route.length, 0);
    const score = routes.reduce((sum, route) => sum + SCORE_BY_LENGTH[route.length], 0);
    if (!integer(player.trains, 0, 45) || player.trains !== trainCount) fail('Train pieces do not match the claimed routes.');
    if (!integer(player.score, 0) || player.score !== score) fail('Route score does not match the claimed routes.');
  }
  if (state.pendingTickets !== null) {
    const pending = state.pendingTickets;
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) fail('Invalid pending destination selection.');
    else {
      ticketArray(pending.ids, 'pending destinations');
      if (pending.playerId !== state.activePlayer || typeof pending.initial !== 'boolean'
        || pending.minKeep !== (pending.initial ? 2 : 1)
        || !Array.isArray(pending.ids) || pending.ids.length < pending.minKeep || pending.ids.length > 3) fail('Invalid pending destination selection.');
      if (pending.initial && Array.isArray(pending.ids) && pending.ids.length !== 3) fail('Initial selection must offer three destination tickets.');
      if (pending.initial && (state.turn !== 0 || Object.keys(claims).length || state.finalTurnsRemaining !== null)) fail('Initial destinations cannot occur after play begins.');
      if (pending.initial && state.players.some((player, index) => Array.isArray(player?.tickets)
        && (index < state.activePlayer ? player.tickets.length < 2 : player.tickets.length !== 0))) fail('Initial destination choices are out of order.');
      if (pending.initial && state.players.some(player => Array.isArray(player?.hand) && player.hand.length !== 4)) fail('Initial hands must contain four train cards.');
    }
  }
  if ((state.phase === 'tickets') !== (state.pendingTickets !== null)) fail('Destination selection does not match the game phase.');
  if (!state.pendingTickets?.initial && state.players.some(player => Array.isArray(player?.tickets) && player.tickets.length < 2)) fail('Each player must have kept at least two initial destination tickets.');
  if (cards.length !== CARD_TOTAL || COLORS.some(color => cards.filter(card => card === color).length !== (color === 'wild' ? 14 : 12))) fail('Train cards are missing, duplicated, or altered.');
  if (tickets.length !== TICKETS.length || new Set(tickets).size !== TICKETS.length) fail('Destination tickets are missing or duplicated.');
  // The derived checks below call engine helpers that require valid player
  // identities and card arrays. Never run them on an already malformed save.
  if (errors.length) return { valid: false, errors };
  const groups = new Map<string, number[]>();
  for (const route of ROUTES) {
    if (route.parallelGroup && Object.hasOwn(claims, route.id)) {
      groups.set(route.parallelGroup, [...(groups.get(route.parallelGroup) ?? []), claims[route.id]]);
    }
  }
  for (const owners of groups.values()) {
    if (owners.length > 1 && (state.players.length <= 3 || new Set(owners).size !== owners.length)) fail('Parallel route ownership violates the player-count rule.');
  }
  if (state.phase === 'game-over' && state.finalTurnsRemaining !== 0) fail('A finished game must complete the final round.');
  if (state.phase !== 'game-over' && state.finalTurnsRemaining === 0) fail('The completed final round must end the game.');
  const stalledFinish = state.phase === 'game-over'
    && Array.isArray(state.market) && Array.isArray(state.deck) && Array.isArray(state.discard)
    && Array.isArray(state.ticketDeck) && !hasAvailableDraw(state) && !state.ticketDeck.length
    && state.players.every(player => player && Array.isArray(player.hand)
      && legalClaims({ ...state, phase: 'turn' }, player.id).length === 0);
  if (state.finalTurnsRemaining !== null && !state.players.some(player => player && player.trains <= 2) && !stalledFinish) fail('The final round has no triggering player.');
  if (state.finalTurnsRemaining === null && state.players.some(player => player && player.trains <= 2)) fail('Low train counts must trigger the final round.');
  if (state.phase === 'draw-second' && Array.isArray(state.market) && Array.isArray(state.deck)
    && Array.isArray(state.discard) && !hasAvailableDraw(state, true)) fail('A second draw with no available card must finish the turn.');
  if (Array.isArray(state.market) && Array.isArray(state.deck) && Array.isArray(state.discard)) {
    if (state.market.length < 5 && state.deck.length + state.discard.length > 0) fail('The market must be replenished while cards remain.');
    const pool = [...state.market, ...state.deck, ...state.discard];
    if (wildCount(state.market) >= 3 && pool.filter(card => card !== 'wild').length >= Math.min(5, pool.length) - 2) fail('A market with three locomotives must be refreshed.');
  }
  return { valid: errors.length === 0, errors };
}
