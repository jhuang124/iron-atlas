import { CITIES, COLORS, ROUTES, SCORE_BY_LENGTH, TICKETS } from './data';
import type { CardColor, Route, Ticket } from './data';
import { isTicketComplete, legalClaims } from './engine';
import type { ClaimOption, GameAction, GameState, Player } from './types';

export type AIDifficulty = 'relaxed' | 'standard' | 'expert';

type TrainColor = Exclude<CardColor, 'wild'>;
type HandCounts = Record<CardColor, number>;
interface PathPlan {
  ticket: Ticket;
  routes: Route[];
  needed: Route[];
  trains: number;
  cost: number;
}
interface RouteGoal {
  route: Route;
  color: TrainColor;
  deficit: number;
  priority: number;
  planned: boolean;
}

const trainColors = COLORS.filter((color): color is TrainColor => color !== 'wild');
const ticketsById = new Map(TICKETS.map(ticket => [ticket.id, ticket]));
const adjacent = new Map<string, Route[]>(CITIES.map(city => [city.id, []]));
const parallelRoutes = new Map<string, Route[]>();
for (const route of ROUTES) {
  adjacent.get(route.from)?.push(route);
  adjacent.get(route.to)?.push(route);
  if (route.parallelGroup) {
    const siblings = parallelRoutes.get(route.parallelGroup) ?? [];
    siblings.push(route);
    parallelRoutes.set(route.parallelGroup, siblings);
  }
}

function handCounts(player: Player): HandCounts {
  const counts = Object.fromEntries(COLORS.map(color => [color, 0])) as HandCounts;
  for (const color of player.hand) counts[color]++;
  return counts;
}

function routeAvailable(state: GameState, route: Route, playerId: number): boolean {
  const owner = state.claims[route.id];
  if (owner !== undefined) return owner === playerId;
  if (route.length > state.players[playerId].trains) return false;
  if (!route.parallelGroup) return true;
  return !(parallelRoutes.get(route.parallelGroup) ?? []).some(sibling => {
    const siblingOwner = state.claims[sibling.id];
    return siblingOwner !== undefined && (siblingOwner === playerId || state.players.length < 4);
  });
}

function routeColor(route: Route, counts: HandCounts, market: CardColor[]): TrainColor {
  if (route.color !== 'gray') return route.color;
  // A visible matching card breaks ties; concealed deck contents are never read.
  let best = trainColors[0];
  let bestValue = -1;
  for (const color of trainColors) {
    const value = Math.min(route.length, counts[color]) * 10
      + Math.min(2, market.filter(card => card === color).length);
    if (value > bestValue) {
      best = color;
      bestValue = value;
    }
  }
  return best;
}

function cardDeficit(route: Route, counts: HandCounts, market: CardColor[]): number {
  return Math.max(0, route.length - counts[routeColor(route, counts, market)] - counts.wild);
}

/** Cheapest remaining connection, treating the player's existing railways as free. */
function planTicket(
  state: GameState,
  player: Player,
  ticket: Ticket,
  counts: HandCounts,
  difficulty: AIDifficulty,
  excludedRoute?: string,
): PathPlan {
  const distance = new Map<string, number>([[ticket.from, 0]]);
  const previous = new Map<string, { city: string; route: Route }>();
  const visited = new Set<string>();
  while (visited.size < CITIES.length) {
    let next: string | undefined;
    let best = Infinity;
    for (const [city, cost] of distance) {
      if (!visited.has(city) && cost < best) {
        next = city;
        best = cost;
      }
    }
    if (next === undefined || next === ticket.to) break;
    visited.add(next);
    for (const route of adjacent.get(next) ?? []) {
      if (route.id === excludedRoute || !routeAvailable(state, route, player.id)) continue;
      const other = route.from === next ? route.to : route.from;
      if (visited.has(other)) continue;
      const own = state.claims[route.id] === player.id;
      // Long routes score efficiently and cost one claim action. Expert planning
      // values both benefits while keeping every edge cost positive.
      const scoringDiscount = difficulty === 'expert' ? (SCORE_BY_LENGTH[route.length] ?? 0) * 0.14 : 0;
      const cost = own ? 0 : route.length - scoringDiscount
        + (difficulty === 'expert' ? 0.55 : 0)
        + cardDeficit(route, counts, state.market)
        * (difficulty === 'relaxed' ? 0 : difficulty === 'expert' ? 0.4 : 0.3);
      const total = best + cost;
      if (total < (distance.get(other) ?? Infinity)) {
        distance.set(other, total);
        previous.set(other, { city: next, route });
      }
    }
  }
  const cost = distance.get(ticket.to) ?? Infinity;
  if (!Number.isFinite(cost)) return { ticket, routes: [], needed: [], trains: Infinity, cost };
  const routes: Route[] = [];
  let cursor = ticket.to;
  while (cursor !== ticket.from) {
    const step = previous.get(cursor);
    if (!step) return { ticket, routes: [], needed: [], trains: Infinity, cost: Infinity };
    routes.unshift(step.route);
    cursor = step.city;
  }
  const needed = routes.filter(route => state.claims[route.id] !== player.id);
  return { ticket, routes, needed, trains: needed.reduce((sum, route) => sum + route.length, 0), cost };
}

function ownPlans(state: GameState, player: Player, counts: HandCounts, difficulty: AIDifficulty): PathPlan[] {
  return player.tickets.flatMap(id => {
    const ticket = ticketsById.get(id);
    return ticket && !isTicketComplete(state, player.id, id)
      ? [planTicket(state, player, ticket, counts, difficulty)] : [];
  });
}

function chooseTickets(state: GameState, player: Player, counts: HandCounts, difficulty: AIDifficulty): GameAction | null {
  const pending = state.pendingTickets;
  if (!pending || pending.playerId !== player.id) return null;
  const candidatePlans = pending.ids.map(id => {
    const ticket = ticketsById.get(id);
    return ticket ? planTicket(state, player, ticket, counts, difficulty) : null;
  });
  if (difficulty === 'relaxed') {
    // The relaxed opponent considers destinations separately; stronger modes
    // also find useful overlap between destinations and the current network.
    const ranked = candidatePlans.map((plan, index) => ({
      id: pending.ids[index],
      value: plan ? plan.ticket.points - plan.trains * 1.25 : -Infinity,
    })).sort((a, b) => b.value - a.value);
    return { type: 'keep-tickets', ticketIds: ranked.slice(0, pending.minKeep).map(candidate => candidate.id) };
  }
  const existingRoutes = new Set(ownPlans(state, player, counts, difficulty).flatMap(plan => plan.needed.map(route => route.id)));
  let bestIds = pending.ids.slice(0, pending.minKeep);
  let bestValue = -Infinity;
  // Ticket offers contain at most three cards. Evaluate their shared railway cost,
  // so overlapping destinations can be kept together instead of judged in isolation.
  for (let mask = 1; mask < 2 ** pending.ids.length; mask++) {
    const indices = pending.ids.flatMap((_, index) => mask & (1 << index) ? [index] : []);
    if (indices.length < pending.minKeep) continue;
    const needed = new Map<string, Route>();
    let value = 0;
    let impossible = false;
    for (const index of indices) {
      const plan = candidatePlans[index];
      if (!plan || !Number.isFinite(plan.cost)) {
        impossible = true;
        value -= 1000;
        continue;
      }
      value += plan.ticket.points;
      for (const route of plan.needed) needed.set(route.id, route);
    }
    let trains = 0;
    let effort = 0;
    for (const route of needed.values()) {
      trains += route.length;
      effort += route.length * (existingRoutes.has(route.id) ? 0.38 : 1)
        + cardDeficit(route, counts, state.market) * 0.12;
    }
    const penalty = pending.initial
      ? difficulty === 'standard' ? 1.08 : 1.06
      : difficulty === 'expert' ? 1.55 : 1.35;
    value -= effort * penalty + indices.length * (pending.initial ? 2.5 : 1.3);
    if (pending.initial && indices.length > pending.minKeep) {
      value -= (indices.length - pending.minKeep) * (difficulty === 'expert' ? 7 : 4);
    }
    if (trains > player.trains) value -= (trains - player.trains) * 12 + 100;
    if (!pending.initial && state.finalTurnsRemaining !== null && needed.size > state.finalTurnsRemaining) value -= 100;
    if (impossible) value -= indices.length;
    if (value > bestValue) {
      bestValue = value;
      bestIds = indices.map(index => pending.ids[index]);
    }
  }
  return { type: 'keep-tickets', ticketIds: bestIds };
}

function networkDegrees(state: GameState, playerId: number): Map<string, number> {
  const degree = new Map<string, number>();
  for (const route of ROUTES) {
    if (state.claims[route.id] !== playerId) continue;
    degree.set(route.from, (degree.get(route.from) ?? 0) + 1);
    degree.set(route.to, (degree.get(route.to) ?? 0) + 1);
  }
  return degree;
}

function networkValue(route: Route, degrees: Map<string, number>): number {
  const from = degrees.get(route.from) ?? 0;
  const to = degrees.get(route.to) ?? 0;
  return (from > 0 ? 1.4 : 0) + (to > 0 ? 1.4 : 0)
    + (from === 1 ? 0.8 : 0) + (to === 1 ? 0.8 : 0);
}

function routeGoals(state: GameState, player: Player, counts: HandCounts, plans: PathPlan[], difficulty: AIDifficulty): RouteGoal[] {
  const priorities = new Map<string, number>();
  for (const plan of plans) {
    if (!Number.isFinite(plan.trains) || plan.trains > player.trains) continue;
    for (const route of plan.needed) {
      let value = (plan.ticket.points * 2 + 12) / Math.max(5, plan.trains)
        * (1 + route.length * 0.07);
      if (plan.needed.length === 1) value += plan.ticket.points * 0.55 + 4;
      if (difficulty === 'expert') {
        const alternative = planTicket(state, player, plan.ticket, counts, difficulty, route.id);
        const extra = alternative.cost - plan.cost;
        value += Number.isFinite(extra) ? Math.min(3, Math.max(0, extra) * 0.28) : 5;
        // Adjacent opponent railways are public information and indicate contention.
        const pressure = [route.from, route.to].reduce((sum, city) => sum + (adjacent.get(city) ?? [])
          .filter(edge => state.claims[edge.id] !== undefined && state.claims[edge.id] !== player.id).length, 0);
        value += Math.min(2.2, pressure * 0.45);
      }
      priorities.set(route.id, (priorities.get(route.id) ?? 0) + value);
    }
  }
  const degrees = networkDegrees(state, player.id);
  return ROUTES.flatMap(route => {
    if (state.claims[route.id] !== undefined || !routeAvailable(state, route, player.id)) return [];
    const planned = priorities.has(route.id);
    const deficit = cardDeficit(route, counts, state.market);
    const points = SCORE_BY_LENGTH[route.length] ?? route.length;
    const priority = (priorities.get(route.id) ?? 0) + points * (planned ? 0.16 : 0.32)
      + networkValue(route, degrees) * (planned ? 0.2 : 0.55);
    return [{ route, color: routeColor(route, counts, state.market), deficit, priority, planned }];
  });
}

function claimAction(option: ClaimOption): GameAction {
  return { type: 'claim-route', routeId: option.routeId, color: option.color, wilds: option.wilds };
}

function bestAllocation(options: ClaimOption[], counts: HandCounts): ClaimOption {
  return options.reduce((best, option) => {
    if (option.wilds !== best.wilds) return option.wilds < best.wilds ? option : best;
    // Gray routes consume the largest available ordinary color pile.
    return counts[option.color] > counts[best.color] ? option : best;
  });
}

function chooseClaim(state: GameState, player: Player, counts: HandCounts, goals: RouteGoal[], plans: PathPlan[], difficulty: AIDifficulty, late: boolean): GameAction | null {
  const options = legalClaims(state, player.id);
  if (!options.length) return null;
  const allocations = new Map<string, ClaimOption[]>();
  for (const option of options) {
    const group = allocations.get(option.routeId) ?? [];
    group.push(option);
    allocations.set(option.routeId, group);
  }
  const hasViablePlans = goals.some(goal => goal.planned);
  const degrees = networkDegrees(state, player.id);
  let selected: ClaimOption | null = null;
  let best = -Infinity;
  for (const goal of goals) {
    const group = allocations.get(goal.route.id);
    if (!group || (!late && hasViablePlans && !goal.planned)) continue;
    const allocation = bestAllocation(group, counts);
    let value = goal.priority + goal.route.length * 0.15 - allocation.wilds * 0.2;
    if (late) {
      value = allocation.points + networkValue(goal.route, degrees) * 0.5 - allocation.wilds * 0.05;
      for (const plan of plans) {
        if (plan.needed.length === 1 && plan.needed[0].id === goal.route.id) value += plan.ticket.points * 2;
      }
    } else if (difficulty === 'relaxed') {
      value -= goal.deficit * 0.1;
    }
    if (value > best) {
      best = value;
      selected = allocation;
    }
  }
  return selected ? claimAction(selected) : null;
}

function drawCard(state: GameState, player: Player, counts: HandCounts, goals: RouteGoal[], difficulty: AIDifficulty): GameAction | null {
  const second = state.phase === 'draw-second';
  const planned = goals.filter(goal => goal.planned && goal.deficit > 0);
  const candidates = (planned.length ? planned : goals.filter(goal => goal.deficit > 0))
    .sort((a, b) => b.priority / (1 + b.deficit * 0.6) - a.priority / (1 + a.deficit * 0.6));
  const focus = candidates.slice(0, difficulty === 'relaxed' ? 1 : difficulty === 'standard' ? 4 : 6);
  const demand = new Map<TrainColor, number>();
  for (let index = 0; index < focus.length; index++) {
    const goal = focus[index];
    const naturalMissing = Math.max(0, goal.route.length - counts[goal.color]);
    if (!naturalMissing) continue;
    const immediate = goal.deficit === 1 ? 1.8 : 1;
    const value = goal.priority * immediate / ((1 + index * 0.7) * (1 + goal.deficit * 0.35));
    demand.set(goal.color, (demand.get(goal.color) ?? 0) + value);
  }
  let marketIndex = -1;
  let bestValue = 0;
  for (let index = 0; index < state.market.length; index++) {
    const color = state.market[index];
    if (color === 'wild') continue;
    const value = demand.get(color) ?? 0;
    if (value > bestValue) {
      bestValue = value;
      marketIndex = index;
    }
  }
  if (marketIndex >= 0) return { type: 'draw-card', source: marketIndex };
  const wildIndex = second ? -1 : state.market.indexOf('wild');
  if (wildIndex >= 0 && focus.length && difficulty !== 'relaxed') {
    const target = focus[0];
    const usefulWild = difficulty === 'expert'
      ? target.deficit === 1 || (target.route.length >= 4 && counts[target.color] >= Math.ceil(target.route.length / 2))
      : target.deficit <= 2 || target.route.length >= 4 || counts.wild === 0;
    if (usefulWild) {
      return { type: 'draw-card', source: wildIndex };
    }
  }
  // Only stock counts are considered, never card order or unseen colors.
  if (state.deck.length + state.discard.length > 0) return { type: 'draw-card', source: 'deck' };
  if (wildIndex >= 0) return { type: 'draw-card', source: wildIndex };
  const available = state.market.findIndex(color => !second || color !== 'wild');
  if (available >= 0) return { type: 'draw-card', source: available };
  return null;
}

/**
 * Select one legal action using the AI's hand and destinations plus public state.
 * No concealed opponent cards, deck order, or undealt destinations influence it.
 */
export function chooseAIAction(state: GameState, difficulty: AIDifficulty = 'standard'): GameAction | null {
  if (state.phase === 'game-over') return null;
  const player = state.players[state.activePlayer];
  if (!player) return null;
  const counts = handCounts(player);
  if (state.phase === 'tickets') return chooseTickets(state, player, counts, difficulty);
  const unfinished = ownPlans(state, player, counts, difficulty);
  const plans = difficulty === 'relaxed' ? unfinished.slice(0, 1) : unfinished;
  const goals = routeGoals(state, player, counts, plans, difficulty);
  if (state.phase === 'draw-second') return drawCard(state, player, counts, goals, difficulty);
  const opponentTrains = state.players.filter(other => other.id !== player.id).map(other => other.trains);
  const nearingFinish = opponentTrains.length > 0 && Math.min(...opponentTrains) <= 6;
  const late = state.finalTurnsRemaining !== null || player.trains <= 8 || nearingFinish;
  const claim = chooseClaim(state, player, counts, goals, plans, difficulty, late);
  if (claim) return claim;
  const canSeekTickets = difficulty !== 'relaxed' && plans.length === 0
    && state.ticketDeck.length > 0 && !late
    && player.trains >= (difficulty === 'expert' ? 28 : 25)
    && Math.min(...opponentTrains) >= (difficulty === 'expert' ? 22 : 16);
  if (canSeekTickets) return { type: 'draw-tickets' };
  const draw = drawCard(state, player, counts, goals, difficulty);
  if (draw) return draw;
  // A depleted market can leave the player holding cards for an unrelated route.
  const fallbackClaims = legalClaims(state, player.id);
  if (fallbackClaims.length) return claimAction(bestAllocation(fallbackClaims, counts));
  if (state.ticketDeck.length > 0) return { type: 'draw-tickets' };
  return { type: 'pass' };
}
