import { addDays, dateKey, parseDateKey, weekdayIndex } from './dates';
import { FEEL_NAMES } from './history';
import { formatDuration } from './math';
import { MODE_NAMES, plannedModes } from './plan';
import type { Feel, History, SessionRecord } from './types';

/** Kalender-Spalten wie bei GitHub: ein gutes Jahr, letzte Spalte ist die aktuelle Woche. */
export const HEATMAP_WEEKS = 53;
export const SUMMARY_WEEKS = 12;
/** Die Verlaufskurven zeigen höchstens so viele Tage zurück. */
export const TREND_DAYS = 365;

export function groupByDay(history: History): Map<string, SessionRecord[]> {
  const map = new Map<string, SessionRecord[]>();
  for (const r of history) {
    const list = map.get(r.day);
    if (list) list.push(r);
    else map.set(r.day, [r]);
  }
  return map;
}

/**
 * Kalenderstufe 0–3 = Anzahl verschiedener Übungen an dem Tag. Wiederholungen zählen nicht
 * extra – vor allem nicht eine zweite CO₂-Tabelle – und Haltezeiten spielen keine Rolle.
 */
export function dayLevel(records: readonly SessionRecord[] | undefined): number {
  return new Set(records?.map((r) => r.mode)).size;
}

export interface HeatDay {
  readonly key: string;
  readonly date: Date;
  readonly level: number;
  readonly future: boolean;
}

/** Wochen-Spalten (je Mo–So), die letzte enthält `today`. */
export function heatmap(history: History, today: Date, weeks = HEATMAP_WEEKS): HeatDay[][] {
  const byDay = groupByDay(history);
  const todayKey = dateKey(today);
  const firstMonday = addDays(today, -weekdayIndex(today) - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(firstMonday, w * 7 + d);
      const key = dateKey(date);
      return { key, date, level: dayLevel(byDay.get(key)), future: key > todayKey };
    }),
  );
}

export interface Streak {
  /** Tage in Folge mit mindestens einer Übung, bis heute bzw. bis gestern, wenn heute noch offen ist. */
  readonly current: number;
  readonly longest: number;
  readonly todayDone: boolean;
}

export function streak(history: History, today: Date): Streak {
  const days = new Set(history.map((r) => r.day));
  const todayDone = days.has(dateKey(today));

  let current = 0;
  let d = todayDone ? today : addDays(today, -1);
  while (days.has(dateKey(d))) {
    current++;
    d = addDays(d, -1);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...days].sort()) {
    const follows = prev !== null && dateKey(addDays(parseDateKey(prev), 1)) === key;
    run = follows ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = key;
  }
  return { current, longest, todayDone };
}

export interface WeekSummary {
  /** Montag der Woche. */
  readonly start: Date;
  readonly minutes: number;
  readonly sessions: number;
  /** Laut Wochenplan vorgesehene Übungen der ganzen Woche … */
  readonly planned: number;
  /** … und wie viele davon erledigt sind. */
  readonly plannedDone: number;
}

/** Die letzten `weeks` Wochen, älteste zuerst; die letzte ist die laufende Woche. */
export function weekSummaries(history: History, today: Date, weeks = SUMMARY_WEEKS): WeekSummary[] {
  const byDay = groupByDay(history);
  const monday = addDays(today, -weekdayIndex(today));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(monday, (i - weeks + 1) * 7);
    let seconds = 0;
    let sessions = 0;
    let planned = 0;
    let plannedDone = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      const records = byDay.get(dateKey(date)) ?? [];
      sessions += records.length;
      for (const r of records) seconds += r.detail?.seconds ?? 0;
      const done = new Set(records.map((r) => r.mode));
      const plan = plannedModes(date);
      planned += plan.length;
      plannedDone += plan.filter((m) => done.has(m)).length;
    }
    return { start, minutes: Math.round(seconds / 60), sessions, planned, plannedDone };
  });
}

export interface Totals {
  readonly sessions: number;
  readonly minutes: number;
  readonly days: number;
}

export function totals(history: History): Totals {
  const seconds = history.reduce((sum, r) => sum + (r.detail?.seconds ?? 0), 0);
  return {
    sessions: history.length,
    minutes: Math.round(seconds / 60),
    days: new Set(history.map((r) => r.day)).size,
  };
}

export interface TrendPoint {
  readonly day: string;
  readonly value: number;
  readonly feel?: Feel;
}

export interface Co2Point extends TrendPoint {
  readonly rounds: number;
  readonly fullHolds: number;
  readonly best?: number;
}

/** Ausatemzeit je Einheit der letzten `TREND_DAYS` Tage (Einträge ohne Details fehlen). */
export function exhaleTrend(history: History, mode: 'belly' | 'lips', today: Date): TrendPoint[] {
  const from = dateKey(addDays(today, -TREND_DAYS));
  const points: TrendPoint[] = [];
  for (const r of history) {
    if (r.mode !== mode || !r.detail || r.day < from) continue;
    points.push(withFeel({ day: r.day, value: r.detail.exhale }, r.feel));
  }
  return points;
}

/** Haltezeit und voll gehaltene Runden je CO₂-Einheit der letzten `TREND_DAYS` Tage. */
export function co2Trend(history: History, today: Date): Co2Point[] {
  const from = dateKey(addDays(today, -TREND_DAYS));
  const points: Co2Point[] = [];
  for (const r of history) {
    if (r.mode !== 'co2' || !r.detail || r.day < from) continue;
    const { hold, rounds, fullHolds, best } = r.detail;
    const point = withFeel({ day: r.day, value: hold, rounds, fullHolds }, r.feel);
    points.push(best === undefined ? point : { ...point, best });
  }
  return points;
}

/** Eine Einheit in Worten, z. B. „CO₂-Toleranz: 8 × 0:30, 7 von 8 voll gehalten, leicht“. */
export function describeRecord(r: SessionRecord): string {
  const parts: string[] = [];
  if (r.mode === 'co2') {
    if (r.detail) {
      const { hold, rounds, fullHolds } = r.detail;
      parts.push(`${rounds} × ${formatDuration(hold)}`, `${fullHolds} von ${rounds} voll gehalten`);
    }
  } else if (r.detail) {
    parts.push(`${Math.round(r.detail.seconds / 60)} min`, `${r.detail.exhale} s aus`);
  }
  if (r.feel) parts.push(FEEL_NAMES[r.feel]);
  return parts.length > 0 ? `${MODE_NAMES[r.mode]}: ${parts.join(', ')}` : MODE_NAMES[r.mode];
}

function withFeel<T extends TrendPoint>(point: T, feel: Feel | undefined): T {
  return feel ? { ...point, feel } : point;
}
