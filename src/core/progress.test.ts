import { describe, expect, it } from 'vitest';
import { dateKey } from './dates';
import {
  co2Trend,
  dayLevel,
  describeRecord,
  exhaleTrend,
  heatmap,
  streak,
  totals,
  weekSummaries,
} from './progress';
import type { History, Mode, SessionRecord } from './types';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
let nextAt = 1;
const rec = (key: string, mode: Mode = 'belly'): SessionRecord => ({
  at: nextAt++,
  day: key,
  mode,
});

describe('dayLevel', () => {
  it('zählt verschiedene Übungen, Wiederholungen nicht extra', () => {
    expect(dayLevel(undefined)).toBe(0);
    expect(dayLevel([rec('2026-10-12', 'co2'), rec('2026-10-12', 'co2')])).toBe(1);
    const all = [rec('2026-10-12'), rec('2026-10-12', 'co2'), rec('2026-10-12', 'lips')];
    expect(dayLevel(all)).toBe(3);
  });
});

describe('heatmap', () => {
  const today = day(2026, 10, 14); // Mittwoch

  it('endet mit der laufenden Woche und markiert die Zukunft', () => {
    const weeks = heatmap([rec('2026-10-13'), rec('2026-10-13', 'co2')], today);
    expect(weeks).toHaveLength(53);
    const last = weeks.at(-1) ?? [];
    expect(last.map((d) => d.key)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(last.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    expect(last[1]?.level).toBe(2);
    expect(weeks[0]?.[0]?.key).toBe('2025-10-13');
  });

  it('liefert lückenlose, eindeutige Tage über beide Zeitumstellungen', () => {
    const keys = heatmap([], today)
      .flat()
      .map((d) => d.key);
    expect(keys).toHaveLength(53 * 7);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('2026-03-29');
    expect(keys).toContain('2025-10-26');
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('streak', () => {
  const today = day(2026, 10, 14);

  it('zählt bis gestern, solange heute noch offen ist', () => {
    const h = [rec('2026-10-11'), rec('2026-10-12'), rec('2026-10-13')];
    expect(streak(h, today)).toEqual({ current: 3, longest: 3, todayDone: false });
    expect(streak([...h, rec('2026-10-14', 'lips')], today)).toEqual({
      current: 4,
      longest: 4,
      todayDone: true,
    });
  });

  it('reißt bei einer Lücke ab, der Rekord bleibt', () => {
    const h = [
      rec('2026-09-29'),
      rec('2026-09-30'),
      rec('2026-10-01'),
      rec('2026-10-02'),
      rec('2026-10-03'),
      rec('2026-10-12'),
      rec('2026-10-13'),
    ];
    expect(streak(h, today)).toEqual({ current: 2, longest: 5, todayDone: false });
    expect(streak(h, day(2026, 10, 16)).current).toBe(0);
  });

  it('zählt über den Jahreswechsel', () => {
    const h = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'].map((k) => rec(k));
    expect(streak(h, day(2027, 1, 2))).toEqual({ current: 4, longest: 4, todayDone: true });
  });

  it('zählt mehrere Übungen an einem Tag als einen Tag', () => {
    const h = [rec('2026-10-14'), rec('2026-10-14', 'co2')];
    expect(streak(h, today).current).toBe(1);
  });

  it('ist ohne Verlauf null', () => {
    expect(streak([], today)).toEqual({ current: 0, longest: 0, todayDone: false });
  });
});

describe('weekSummaries', () => {
  it('summiert Minuten, Einheiten und erfüllten Wochenplan je Woche', () => {
    const h: History = [
      { at: 1, day: '2026-10-12', mode: 'belly', detail: { seconds: 300, exhale: 6 } },
      {
        at: 2,
        day: '2026-10-12',
        mode: 'co2',
        detail: { seconds: 590, hold: 30, rounds: 8, fullHolds: 8 },
      },
      { at: 3, day: '2026-10-17', mode: 'lips', detail: { seconds: 300, exhale: 8 } }, // Samstag: nicht geplant
      rec('2026-10-06'), // Vorwoche, ohne Details
    ];
    const weeks = weekSummaries(h, day(2026, 10, 14), 2);
    expect(weeks.map((w) => dateKey(w.start))).toEqual(['2026-10-05', '2026-10-12']);
    expect(weeks[1]).toMatchObject({ minutes: 20, sessions: 3, planned: 12, plannedDone: 2 });
    expect(weeks[0]).toMatchObject({ minutes: 0, sessions: 1, plannedDone: 1 });
  });
});

describe('totals', () => {
  it('zählt Einheiten, Minuten und Trainingstage', () => {
    const h: History = [
      { at: 1, day: '2026-10-12', mode: 'belly', detail: { seconds: 600, exhale: 6 } },
      { at: 2, day: '2026-10-12', mode: 'lips', detail: { seconds: 300, exhale: 8 } },
      rec('2026-10-13'),
    ];
    expect(totals(h)).toEqual({ sessions: 3, minutes: 15, days: 2 });
  });
});

describe('Trends', () => {
  const today = day(2026, 10, 14);
  const h: History = [
    { at: 1, day: '2025-09-01', mode: 'belly', detail: { seconds: 300, exhale: 6 } }, // zu alt
    { at: 2, day: '2026-10-01', mode: 'belly', feel: 'easy', detail: { seconds: 300, exhale: 7 } },
    { at: 3, day: '2026-10-02', mode: 'lips', detail: { seconds: 300, exhale: 9 } },
    rec('2026-10-03'), // ohne Details
    {
      at: 4,
      day: '2026-10-05',
      mode: 'co2',
      feel: 'hard',
      detail: { seconds: 500, hold: 45, rounds: 8, fullHolds: 6, best: 90 },
    },
  ];

  it('liefert die Ausatemzeiten einer Übung', () => {
    expect(exhaleTrend(h, 'belly', today)).toEqual([{ day: '2026-10-01', value: 7, feel: 'easy' }]);
    expect(exhaleTrend(h, 'lips', today)).toEqual([{ day: '2026-10-02', value: 9 }]);
  });

  it('liefert Haltezeit, volle Runden und Bestzeit bei CO₂', () => {
    expect(co2Trend(h, today)).toEqual([
      { day: '2026-10-05', value: 45, rounds: 8, fullHolds: 6, best: 90, feel: 'hard' },
    ]);
  });
});

describe('describeRecord', () => {
  it('beschreibt Einheiten mit und ohne Details', () => {
    expect(describeRecord(rec('2026-10-12', 'lips'))).toBe('Lippenbremse');
    expect(
      describeRecord({
        at: 1,
        day: '2026-10-12',
        mode: 'belly',
        feel: 'ok',
        detail: { seconds: 300, exhale: 6 },
      }),
    ).toBe('Zwerchfellatmung: 5 min, 6 s aus, passend');
    expect(
      describeRecord({
        at: 2,
        day: '2026-10-12',
        mode: 'co2',
        detail: { seconds: 590, hold: 30, rounds: 8, fullHolds: 7 },
      }),
    ).toBe('CO₂-Toleranz: 8 × 0:30, 7 von 8 voll gehalten');
  });
});
