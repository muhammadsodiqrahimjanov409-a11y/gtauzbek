import type { SaveState } from '../types/game';
import { validateSaveData } from './saveValidation';

const SAVE_STORAGE_KEY = 'nexus_city_save_v1';

export function hasSavedGame(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return validateSaveData(parsed).valid;
  } catch {
    return false;
  }
}

export function loadSavedGame(): { state: SaveState | null; corrupted: boolean } {
  if (typeof window === 'undefined') return { state: null, corrupted: false };
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return { state: null, corrupted: false };
    const parsed: unknown = JSON.parse(raw);
    const result = validateSaveData(parsed);
    if (!result.valid || !result.data) {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
      return { state: null, corrupted: true };
    }
    return { state: result.data, corrupted: false };
  } catch {
    try {
      window.localStorage.removeItem(SAVE_STORAGE_KEY);
    } catch {
      // Ignore storage lock
    }
    return { state: null, corrupted: true };
  }
}

export function writeSavedGame(save: SaveState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedGame(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}
