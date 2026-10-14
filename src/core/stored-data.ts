import { mergeHistory, migrateLog, sanitizeHistory } from './history';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { isRecord } from './types';
import type { History, Settings } from './types';

/**
 * Schlüssel in localStorage. Der Name ist historisch, maßgeblich ist das Feld `version`.
 * Bei Änderungen am Format: Version hochzählen und in `parseStoredData` eine Migration
 * vom alten Format ergänzen.
 */
export const STORAGE_KEY = 'atemtrainer.v2';
export const STORAGE_VERSION = 3;

export interface StoredData {
  readonly settings: Settings;
  readonly history: History;
}

export const EMPTY_DATA: StoredData = { settings: DEFAULT_SETTINGS, history: [] };

/** Liest gespeicherte Daten robust: Kaputtes JSON oder fremde Werte führen zu Standardwerten, nie zu einem Fehler. */
export function parseStoredData(raw: string | null): StoredData {
  if (raw === null) return EMPTY_DATA;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DATA;
  }
  if (!isRecord(parsed)) return EMPTY_DATA;
  return { settings: sanitizeSettings(parsed.settings), history: parseHistory(parsed) };
}

/**
 * Liest eine Export-Datei (Format v2 oder v3) mit derselben Bereinigung wie beim Laden.
 * `null`, wenn die Datei nicht nach einer Sicherung des Atemtrainers aussieht.
 */
export function parseImport(raw: string): StoredData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.version !== 'number' || !isRecord(parsed.settings)) {
    return null;
  }
  return { settings: sanitizeSettings(parsed.settings), history: parseHistory(parsed) };
}

/** Import: Verläufe werden zusammengeführt (ohne Duplikate), die Einstellungen kommen aus der Datei. */
export function mergeData(current: StoredData, imported: StoredData): StoredData {
  return {
    settings: imported.settings,
    history: mergeHistory(current.history, imported.history),
  };
}

export function serializeStoredData(data: StoredData): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    settings: data.settings,
    history: data.history,
  });
}

/**
 * v3: `history` mit einzelnen Einheiten. v2 (und ohne Version): `log` mit Tag → Übungen.
 * Neuere Versionen werden bestmöglich als v3 gelesen, statt den Verlauf zu verwerfen.
 */
function parseHistory(parsed: Readonly<Record<string, unknown>>): History {
  const version = typeof parsed.version === 'number' ? parsed.version : 0;
  return version >= 3 ? sanitizeHistory(parsed.history) : migrateLog(parsed.log);
}
