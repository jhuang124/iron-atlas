import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAIAction } from '../src/game/ai';
import { createGame, transition, validateState } from '../src/game/engine';
import type { GameAction, GameState } from '../src/game/types';
import {
  SAVE_KEY, PREFERENCES_KEY, clearSave, exportSave, importSave,
  loadGame, loadPreferences, saveGame, savePreferences,
} from '../src/ui/storage';

function fresh(count = 3, seed = 731): GameState {
  return createGame({ seed, players: Array.from({ length: count }, (_, id) => ({
    name: `Player ${id + 1}`, kind: 'ai', color: `color-${id}`,
  })) });
}

function act(state: GameState, action: GameAction): GameState {
  const result = transition(state, action);
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(validateState(result.state), { valid: true, errors: [] });
  return result.state;
}

function started(): GameState {
  let state = fresh();
  while (state.pendingTickets?.initial) {
    state = act(state, { type: 'keep-tickets', ticketIds: state.pendingTickets.ids.slice(0, 2) });
  }
  return state;
}

function restored(state: GameState): GameState {
  const before = structuredClone(state);
  const result = importSave(exportSave(state));
  assert.equal(result.error, undefined);
  assert.ok(result.state);
  assert.deepEqual(result.state, state);
  assert.deepEqual(state, before, 'export never mutates the game or advances the RNG');
  return result.state;
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

function withStore(store: Store | undefined, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  try { run(); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test('an opening destination choice survives export and resumes the next private choice identically', () => {
  const state = fresh();
  assert.equal(state.pendingTickets!.initial, true);
  assert.equal(state.pendingTickets!.minKeep, 2);
  const action: GameAction = { type: 'keep-tickets', ticketIds: state.pendingTickets!.ids.slice(0, 2) };
  const uninterrupted = act(state, action);
  const resumed = act(restored(state), action);
  assert.deepEqual(resumed, uninterrupted);
  assert.equal(resumed.activePlayer, 1);
  assert.equal(resumed.pendingTickets!.playerId, 1);
  assert.equal(resumed.pendingTickets!.initial, true);
});

test('an interrupted first draw retains its RNG and must finish the second draw after reload', () => {
  const state = act(started(), { type: 'draw-card', source: 'deck' });
  assert.equal(state.phase, 'draw-second');
  const store = memoryStore();
  withStore(store, () => {
    assert.equal(saveGame(state), true);
    const resumed = loadGame().state!;
    assert.deepEqual(resumed, state);
    assert.ok(transition(resumed, { type: 'draw-tickets' }).error);
    const second: GameAction = { type: 'draw-card', source: 'deck' };
    assert.deepEqual(act(resumed, second), act(state, second));
    assert.equal(act(resumed, second).activePlayer, 1);
  });
});

test('later pending tickets preserve minimum, offered IDs, and returned deck order across import', () => {
  const state = act(started(), { type: 'draw-tickets' });
  assert.equal(state.pendingTickets!.initial, false);
  assert.equal(state.pendingTickets!.minKeep, 1);
  const resumed = restored(state);
  assert.ok(transition(resumed, { type: 'keep-tickets', ticketIds: [] }).error);
  const action: GameAction = { type: 'keep-tickets', ticketIds: [state.pendingTickets!.ids[1]] };
  const next = act(resumed, action);
  assert.deepEqual(next, act(state, action));
  assert.deepEqual(next.ticketDeck.slice(-2), state.pendingTickets!.ids.filter(id => id !== action.ticketIds[0]));
  assert.equal(next.activePlayer, 1);
});

test('a saved final-round countdown completes the same actions and ends at zero after import', () => {
  let state = fresh(2, 991);
  let actions = 0;
  while (state.finalTurnsRemaining === null && actions++ < 1800) {
    const action = chooseAIAction(state, 'relaxed');
    assert.ok(action);
    state = act(state, action);
  }
  assert.equal(state.phase, 'turn');
  assert.equal(state.finalTurnsRemaining, state.players.length);
  let resumed = restored(state);
  while (state.phase !== 'game-over' && actions++ < 1800) {
    const action = chooseAIAction(state, 'relaxed');
    assert.ok(action);
    assert.deepEqual(chooseAIAction(resumed, 'relaxed'), action);
    state = act(state, action);
    resumed = act(resumed, action);
    assert.deepEqual(resumed, state);
    if (state.phase !== 'game-over') resumed = restored(resumed);
  }
  assert.equal(resumed.phase, 'game-over');
  assert.equal(resumed.finalTurnsRemaining, 0);
  assert.deepEqual(restored(resumed), resumed, 'completed results also survive export');
});

test('imports reject malformed, oversized, unsupported, and damaged saves without throwing', () => {
  const text = exportSave(started());
  for (const invalid of ['', 'not JSON', 'null', '[]', '{}', ' '.repeat(2_000_001)]) {
    assert.equal(importSave(invalid).state, null);
    assert.ok(importSave(invalid).error);
  }
  const mutate = (patch: (envelope: Record<string, unknown>) => void) => {
    const envelope = JSON.parse(text) as Record<string, unknown>;
    patch(envelope);
    const result = importSave(JSON.stringify(envelope));
    assert.equal(result.state, null);
    assert.ok(result.error);
  };
  mutate(envelope => { envelope.version = 2; });
  mutate(envelope => { envelope.format = 'another-game'; });
  mutate(envelope => { envelope.savedAt = -1; });
  mutate(envelope => { envelope.checksum = '00000000'; });
  mutate(envelope => { envelope.state = null; });
  mutate(envelope => { (envelope.state as GameState).players[0].hand.push('wild'); delete envelope.checksum; });
  mutate(envelope => { (envelope.state as GameState).rng = -1; delete envelope.checksum; });
  const legacy = JSON.parse(text);
  delete legacy.checksum;
  assert.ok(importSave(JSON.stringify(legacy)).state, 'checksums are optional for version-1 imports');
});

test('an invalid state cannot be exported or overwrite an existing good autosave', () => {
  const state = started();
  const store = memoryStore();
  withStore(store, () => {
    assert.equal(saveGame(state), true);
    const goodText = store.values.get(SAVE_KEY);
    const invalid = { ...state, rng: -1 };
    assert.throws(() => exportSave(invalid));
    assert.equal(saveGame(invalid), false);
    assert.equal(store.values.get(SAVE_KEY), goodText);
    assert.deepEqual(loadGame().state, state);
    clearSave();
    assert.equal(store.values.has(SAVE_KEY), false);
  });
});

test('missing, blocked, and quota-exceeded browser storage leave gameplay usable', () => {
  const state = started();
  withStore(undefined, () => {
    assert.equal(saveGame(state), false);
    assert.deepEqual(loadGame(), { state: null });
    assert.equal(savePreferences({ muted: true }), false);
    assert.deepEqual(loadPreferences(), {});
    clearSave();
  });
  withStore({
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() { throw new Error('blocked'); },
  }, () => {
    assert.equal(saveGame(state), false);
    assert.equal(loadGame().state, null);
    assert.ok(loadGame().error);
    assert.equal(savePreferences({ muted: true }), false);
    assert.deepEqual(loadPreferences(), {});
    clearSave();
  });
});

test('preferences round-trip separately and malformed stored JSON is handled safely', () => {
  const store = memoryStore();
  withStore(store, () => {
    assert.equal(savePreferences({ muted: true, flat: false, difficulty: 'expert' }), true);
    assert.deepEqual(loadPreferences(), { muted: true, flat: false, difficulty: 'expert' });
    assert.equal(store.values.has(SAVE_KEY), false);
    for (const invalid of ['{broken', 'null', '[1]', 'true']) {
      store.values.set(PREFERENCES_KEY, invalid);
      assert.deepEqual(loadPreferences(), {});
    }
    store.values.set(SAVE_KEY, '{broken');
    assert.equal(loadGame().state, null);
    assert.ok(loadGame().error);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.equal(savePreferences(circular), false);
  });
});
