import { validateState } from '../game/engine';
import type { GameState } from '../game/types';

export const SAVE_KEY = 'iron-atlas.save.v1';
export const PREFERENCES_KEY = 'iron-atlas.preferences.v1';

interface SaveEnvelope {
  format: 'iron-atlas';
  version: 1;
  savedAt: number;
  checksum?: string;
  state: GameState;
}

export interface SaveResult {
  state: GameState | null;
  error?: string;
}

const MAX_SAVE_LENGTH = 2_000_000;

function localStore(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// A small integrity check catches truncated or accidentally edited exports.
function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stateError(state: unknown): string | null {
  try {
    const result = validateState(state);
    if (result.valid) return null;
    return result.errors.length ? `Invalid game: ${result.errors.slice(0, 3).join(' ')}` : 'This game is invalid.';
  } catch {
    return 'This file does not contain a valid Iron Atlas game.';
  }
}

/** Serialize only an engine-validated state, including the RNG needed to resume it. */
export function exportSave(state: GameState): string {
  const error = stateError(state);
  if (error) throw new Error(error);
  const stateText = JSON.stringify(state);
  const envelope: SaveEnvelope = {
    format: 'iron-atlas',
    version: 1,
    savedAt: Date.now(),
    checksum: checksum(stateText),
    state,
  };
  const text = JSON.stringify(envelope, null, 2);
  if (text.length > MAX_SAVE_LENGTH) throw new Error('This game is too large to save.');
  return text;
}

/** Parse untrusted JSON without throwing or altering the active game. */
export function importSave(text: string): SaveResult {
  try {
    if (typeof text !== 'string' || text.length > MAX_SAVE_LENGTH) {
      return { state: null, error: 'This save file is too large.' };
    }
    const envelope: unknown = JSON.parse(text);
    if (!isRecord(envelope) || envelope.format !== 'iron-atlas' || envelope.version !== 1) {
      return { state: null, error: 'Choose an Iron Atlas save file (version 1).' };
    }
    if (typeof envelope.savedAt !== 'number' || !Number.isFinite(envelope.savedAt) || envelope.savedAt < 0) {
      return { state: null, error: 'This save file has an invalid timestamp.' };
    }
    const error = stateError(envelope.state);
    if (error) return { state: null, error };
    if (envelope.checksum !== undefined && (
      typeof envelope.checksum !== 'string' || envelope.checksum !== checksum(JSON.stringify(envelope.state))
    )) {
      return { state: null, error: 'This save file is damaged or has been changed.' };
    }
    return { state: envelope.state as unknown as GameState };
  } catch {
    return { state: null, error: 'This save file could not be read. Choose a JSON save exported by Iron Atlas.' };
  }
}

export function saveGame(state: GameState): boolean {
  try {
    const store = localStore();
    if (!store) return false;
    store.setItem(SAVE_KEY, exportSave(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): SaveResult {
  try {
    const store = localStore();
    if (!store) return { state: null };
    const text = store.getItem(SAVE_KEY);
    return text ? importSave(text) : { state: null };
  } catch {
    return { state: null, error: 'The browser could not read your saved game.' };
  }
}

export function clearSave(): void {
  try {
    localStore()?.removeItem(SAVE_KEY);
  } catch {
    // A blocked storage area must not interrupt a new game.
  }
}

export function savePreferences(prefs: Record<string, unknown>): boolean {
  try {
    if (!isRecord(prefs)) return false;
    const store = localStore();
    if (!store) return false;
    store.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export function loadPreferences(): Record<string, unknown> {
  try {
    const text = localStore()?.getItem(PREFERENCES_KEY);
    if (!text) return {};
    const prefs: unknown = JSON.parse(text);
    return isRecord(prefs) ? prefs : {};
  } catch {
    return {};
  }
}
