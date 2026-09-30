import type { CardColor } from './data';

export interface Player {
  id: number;
  name: string;
  kind: 'human' | 'ai';
  color: string;
  hand: CardColor[];
  tickets: string[];
  trains: number;
  /** Points earned by claimed routes; ticket and bonus points are computed at the end. */
  score: number;
}

export interface PendingTickets {
  playerId: number;
  ids: string[];
  minKeep: number;
  initial: boolean;
}

export interface GameState {
  version: 1;
  /** State of the seeded, serializable pseudo-random generator. */
  rng: number;
  players: Player[];
  activePlayer: number;
  phase: 'tickets' | 'turn' | 'draw-second' | 'game-over';
  pendingTickets: PendingTickets | null;
  /** The next card is at the end of the deck. */
  deck: CardColor[];
  discard: CardColor[];
  market: CardColor[];
  /** The next destination is at the beginning of this deck. */
  ticketDeck: string[];
  claims: Record<string, number>;
  finalTurnsRemaining: number | null;
  /** Number of completed turns, excluding initial destination selection. */
  turn: number;
  log: string[];
}

export type GameAction =
  | { type: 'draw-card'; source: 'deck' | number }
  | { type: 'claim-route'; routeId: string; color: CardColor; wilds: number }
  | { type: 'draw-tickets' }
  | { type: 'keep-tickets'; ticketIds: string[] }
  /** Only legal when no cards, routes, or destination tickets are available. */
  | { type: 'pass' };

export interface GameConfig {
  players: Pick<Player, 'name' | 'kind' | 'color'>[];
  seed: number;
}

export interface ClaimOption {
  routeId: string;
  color: CardColor;
  wilds: number;
  length: number;
  points: number;
}

export interface FinalStanding {
  playerId: number;
  name: string;
  routeScore: number;
  ticketScore: number;
  completedTickets: number;
  totalTickets: number;
  longestRoute: number;
  longestBonus: number;
  totalScore: number;
  rank: number;
  ticketResults: { ticketId: string; complete: boolean; points: number }[];
}

export interface TransitionResult {
  state: GameState;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
