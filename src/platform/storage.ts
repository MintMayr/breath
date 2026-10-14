import { STORAGE_KEY, parseStoredData, serializeStoredData } from '../core/stored-data';
import type { StoredData } from '../core/stored-data';

/**
 * localStorage kann werfen (privater Modus, gesperrte Website-Daten, Speicher voll).
 * Das Training soll dann trotzdem laufen, nur ohne Verlauf.
 */
export function loadData(): StoredData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Kein Zugriff auf localStorage: mit Standardwerten weitermachen.
  }
  return parseStoredData(raw);
}

export function saveData(data: StoredData): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeStoredData(data));
  } catch {
    // Speichern nicht möglich: Daten bleiben bis zum Neuladen im Speicher.
  }
}
