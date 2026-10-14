import { isDateKey, parseDateKey } from './dates';
import { clamp } from './math';
import { buildSequence, totalSeconds } from './sequence';
import { co2HoldFor } from './settings';
import { isFeel, isMode, isRecord } from './types';
import type {
  BreathingDetail,
  Co2Detail,
  Feel,
  History,
  Mode,
  SessionRecord,
  Settings,
} from './types';

/** So viele Trainingstage bleiben gespeichert (gut zwei Jahre); ältere fallen heraus. */
export const HISTORY_KEEP_DAYS = 730;
/** Obergrenze gegen aufgeblähte oder manipulierte Daten. */
const MAX_RECORDS = 10_000;

/** Großzügige Plausibilitätsgrenzen für gespeicherte Werte. Bewusst nicht `SETTING_SPECS`:
 * Der Verlauf beschreibt Vergangenes und soll gültig bleiben, wenn sich die Einstellgrenzen ändern. */
const LIMITS = { seconds: 4 * 3600, exhale: 60, hold: 600, rounds: 50, best: 900 } as const;

export const FEEL_NAMES: Readonly<Record<Feel, string>> = {
  easy: 'leicht',
  ok: 'passend',
  hard: 'schwer',
};

/** An einem Tag erledigte Übungen, ohne Duplikate, in der Reihenfolge des ersten Abschlusses. */
export function doneOn(history: History, key: string): Mode[] {
  const modes = new Set<Mode>();
  for (const r of history) if (r.day === key) modes.add(r.mode);
  return [...modes];
}

/** Baut den Eintrag für eine gerade abgeschlossene Einheit. */
export function createRecord(
  mode: Mode,
  settings: Settings,
  day: string,
  at: number,
  cutHolds: number,
): SessionRecord {
  const seconds = totalSeconds(buildSequence(mode, settings));
  switch (mode) {
    case 'belly':
      return { at, day, mode, detail: { seconds, exhale: settings.bellyExhale } };
    case 'lips':
      return { at, day, mode, detail: { seconds, exhale: settings.lipsExhale } };
    case 'co2': {
      const rounds = settings.co2Rounds;
      const fullHolds = clamp(rounds - cutHolds, 0, rounds);
      const detail = { seconds, hold: co2HoldFor(settings), rounds, fullHolds };
      return {
        at,
        day,
        mode,
        detail: settings.co2Basis === 'best' ? { ...detail, best: settings.co2Best } : detail,
      };
    }
  }
}

/** Fügt eine Einheit hinzu. Gibt einen neuen Verlauf zurück, das Original bleibt unverändert. */
export function addRecord(history: History, record: SessionRecord): History {
  return mergeHistory(history, [record]);
}

export function setFeel(history: History, at: number, feel: Feel): History {
  return history.map((r) => (r.at === at ? { ...r, feel } : r));
}

/** Behält die jüngsten `keep` Trainingstage. `YYYY-MM-DD` ist lexikografisch sortierbar. */
export function pruneHistory(history: History, keep = HISTORY_KEEP_DAYS): History {
  const days = [...new Set(history.map((r) => r.day))].sort();
  if (days.length <= keep) return history;
  const first = days[days.length - keep] ?? '';
  return history.filter((r) => r.day >= first);
}

/**
 * Vereinigt zwei Verläufe. Gleiche Einheiten (gleiche Startzeit und Übung) zählen einmal;
 * dabei gewinnt `a`, eine Bewertung aus `b` wird aber übernommen, wenn `a` keine hat.
 */
export function mergeHistory(a: History, b: History): History {
  const merged = new Map<string, SessionRecord>();
  for (const r of [...a, ...b]) {
    const key = `${r.at}:${r.mode}`;
    const existing = merged.get(key);
    if (!existing) merged.set(key, r);
    else if (!existing.feel && r.feel) merged.set(key, { ...existing, feel: r.feel });
  }
  return pruneHistory([...merged.values()].sort((x, y) => x.at - y.at));
}

/** Übernimmt aus unbekannten Daten nur gültige Einheiten; ungültige Details fallen weg. */
export function sanitizeHistory(raw: unknown): History {
  if (!Array.isArray(raw)) return [];
  const records: SessionRecord[] = [];
  for (const item of raw.slice(-MAX_RECORDS)) {
    const r = sanitizeRecord(item);
    if (r) records.push(r);
  }
  return mergeHistory(records, []);
}

/**
 * Format v2 hat sich nur gemerkt, welche Übungen an einem Tag erledigt waren
 * (`{ "2026-10-12": ["belly", "co2"] }`). Daraus werden Einheiten ohne Details um 12:00 Uhr.
 */
export function migrateLog(raw: unknown): History {
  if (!isRecord(raw)) return [];
  const records: SessionRecord[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!isDateKey(key) || !Array.isArray(value)) continue;
    const noon = parseDateKey(key).getTime();
    const modes = [...new Set(value.filter(isMode))];
    modes.forEach((mode, i) => records.push({ at: noon + i, day: key, mode }));
  }
  return mergeHistory(records, []);
}

function sanitizeRecord(raw: unknown): SessionRecord | null {
  if (!isRecord(raw)) return null;
  const { at, day, mode, feel, detail } = raw;
  if (!isInt(at, 1, Number.MAX_SAFE_INTEGER) || typeof day !== 'string' || !isDateKey(day)) {
    return null;
  }
  if (!isMode(mode)) return null;
  const base = isFeel(feel) ? { at, day, feel } : { at, day };
  if (mode === 'co2') {
    const d = sanitizeCo2Detail(detail);
    return d ? { ...base, mode, detail: d } : { ...base, mode };
  }
  const d = sanitizeBreathingDetail(detail);
  return d ? { ...base, mode, detail: d } : { ...base, mode };
}

function sanitizeBreathingDetail(raw: unknown): BreathingDetail | null {
  if (!isRecord(raw)) return null;
  const { seconds, exhale } = raw;
  if (!isInt(seconds, 1, LIMITS.seconds) || !isInt(exhale, 1, LIMITS.exhale)) return null;
  return { seconds, exhale };
}

function sanitizeCo2Detail(raw: unknown): Co2Detail | null {
  if (!isRecord(raw)) return null;
  const { seconds, hold, rounds, fullHolds, best } = raw;
  if (
    !isInt(seconds, 1, LIMITS.seconds) ||
    !isInt(hold, 1, LIMITS.hold) ||
    !isInt(rounds, 1, LIMITS.rounds) ||
    !isInt(fullHolds, 0, rounds)
  ) {
    return null;
  }
  const d: Co2Detail = { seconds, hold, rounds, fullHolds };
  return isInt(best, 1, LIMITS.best) ? { ...d, best } : d;
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
