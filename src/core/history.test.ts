import { describe, expect, it } from 'vitest';
import {
  addRecord,
  createRecord,
  doneOn,
  mergeHistory,
  migrateLog,
  pruneHistory,
  sanitizeHistory,
  setFeel,
} from './history';
import { DEFAULT_SETTINGS } from './settings';
import type { History, SessionRecord } from './types';

const rec = (at: number, day: string, mode: SessionRecord['mode']): SessionRecord => ({
  at,
  day,
  mode,
});

describe('doneOn', () => {
  it('liefert jede Übung eines Tages einmal, in Abschlussreihenfolge', () => {
    const h: History = [
      rec(1, '2026-10-12', 'co2'),
      rec(2, '2026-10-12', 'belly'),
      rec(3, '2026-10-12', 'co2'),
      rec(4, '2026-10-13', 'lips'),
    ];
    expect(doneOn(h, '2026-10-12')).toEqual(['co2', 'belly']);
    expect(doneOn(h, '2026-10-14')).toEqual([]);
  });
});

describe('createRecord', () => {
  it('merkt sich Dauer und Ausatemzeit einer Atemübung', () => {
    const r = createRecord('belly', DEFAULT_SETTINGS, '2026-10-12', 99, 0);
    // 5 min mit 4 s ein + 6 s aus = 30 Atemzüge à 10 s
    expect(r).toEqual({
      at: 99,
      day: '2026-10-12',
      mode: 'belly',
      detail: { seconds: 300, exhale: 6 },
    });
  });

  it('zählt bei CO₂ die voll gehaltenen Runden', () => {
    const r = createRecord('co2', DEFAULT_SETTINGS, '2026-10-12', 99, 2);
    expect(r.mode === 'co2' && r.detail).toEqual({
      seconds: 590,
      hold: 30,
      rounds: 8,
      fullHolds: 6,
    });
  });

  it('merkt sich bei CO₂ nach Bestzeit die tatsächliche Haltezeit und die Bestzeit', () => {
    const s = { ...DEFAULT_SETTINGS, co2Basis: 'best' as const, co2Best: 100, co2Rounds: 4 };
    const r = createRecord('co2', s, '2026-10-12', 99, 0);
    expect(r.mode === 'co2' && r.detail).toMatchObject({ hold: 50, best: 100, fullHolds: 4 });
  });
});

describe('addRecord / setFeel', () => {
  it('fügt sortiert ein, ohne das Original zu verändern, und nichts doppelt', () => {
    const h: History = [rec(10, '2026-10-12', 'belly')];
    const next = addRecord(h, rec(5, '2026-10-11', 'lips'));
    expect(next.map((r) => r.at)).toEqual([5, 10]);
    expect(h).toHaveLength(1);
    expect(addRecord(next, rec(10, '2026-10-12', 'belly'))).toHaveLength(2);
  });

  it('setzt die Bewertung genau einer Einheit', () => {
    const h: History = [rec(1, '2026-10-12', 'belly'), rec(2, '2026-10-12', 'co2')];
    const next = setFeel(h, 2, 'hard');
    expect(next[1]?.feel).toBe('hard');
    expect(next[0]?.feel).toBeUndefined();
    expect(h[1]?.feel).toBeUndefined();
  });
});

describe('pruneHistory', () => {
  it('behält die jüngsten Trainingstage samt aller Einheiten daran', () => {
    const h: History = [
      rec(1, '2026-09-30', 'belly'),
      rec(2, '2026-10-01', 'co2'),
      rec(3, '2026-10-01', 'belly'),
      rec(4, '2026-10-03', 'belly'),
    ];
    expect(pruneHistory(h, 2).map((r) => r.at)).toEqual([2, 3, 4]);
    expect(pruneHistory(h, 3)).toBe(h);
  });
});

describe('mergeHistory', () => {
  it('vereinigt, sortiert und entfernt Duplikate, Bewertungen gehen nicht verloren', () => {
    const a: History = [rec(1, '2026-10-12', 'belly'), rec(3, '2026-10-12', 'co2')];
    const b: History = [
      { ...rec(1, '2026-10-12', 'belly'), feel: 'ok' },
      rec(2, '2026-10-12', 'lips'),
    ];
    const merged = mergeHistory(a, b);
    expect(merged.map((r) => r.at)).toEqual([1, 2, 3]);
    expect(merged[0]?.feel).toBe('ok');
  });
});

describe('sanitizeHistory', () => {
  it('verwirft ungültige Einträge und Details', () => {
    const raw = [
      { at: 1, day: '2026-10-12', mode: 'belly', detail: { seconds: 300, exhale: 6 }, feel: 'ok' },
      {
        at: 2,
        day: '2026-10-12',
        mode: 'co2',
        detail: { seconds: 500, hold: 30, rounds: 8, fullHolds: 9 },
      },
      { at: 3, day: '2026-10-12', mode: 'lips', feel: 'super' },
      { at: 4, day: 'kein-datum', mode: 'belly' },
      { at: -1, day: '2026-10-12', mode: 'belly' },
      { at: 5, day: '2026-10-12', mode: 'nope' },
      'Müll',
    ];
    expect(sanitizeHistory(raw)).toEqual([
      { at: 1, day: '2026-10-12', mode: 'belly', feel: 'ok', detail: { seconds: 300, exhale: 6 } },
      { at: 2, day: '2026-10-12', mode: 'co2' }, // mehr volle Runden als Runden
      { at: 3, day: '2026-10-12', mode: 'lips' },
    ]);
  });

  it('behält die Bestzeit nur, wenn sie plausibel ist', () => {
    const detail = { seconds: 500, hold: 45, rounds: 8, fullHolds: 8 };
    const [ok, bad] = sanitizeHistory([
      { at: 1, day: '2026-10-12', mode: 'co2', detail: { ...detail, best: 90 } },
      { at: 2, day: '2026-10-12', mode: 'co2', detail: { ...detail, best: 'viel' } },
    ]);
    expect(ok?.detail).toEqual({ ...detail, best: 90 });
    expect(bad?.detail).toEqual(detail);
  });

  it('liefert einen leeren Verlauf für Müll', () => {
    expect(sanitizeHistory(undefined)).toEqual([]);
    expect(sanitizeHistory({ '2026-10-12': ['belly'] })).toEqual([]);
  });
});

describe('migrateLog (Format v2)', () => {
  it('macht aus Tag → Übungen Einheiten um 12 Uhr, ohne Müll und Duplikate', () => {
    const raw = {
      '2026-10-12': ['belly', 'belly', 'nope', 3, 'co2'],
      'kein-datum': ['belly'],
      '2026-10-13': 'belly',
      '2026-10-14': [],
    };
    const noon = new Date(2026, 9, 12, 12).getTime();
    expect(migrateLog(raw)).toEqual([
      { at: noon, day: '2026-10-12', mode: 'belly' },
      { at: noon + 1, day: '2026-10-12', mode: 'co2' },
    ]);
  });

  it('liefert einen leeren Verlauf für Müll', () => {
    expect(migrateLog(undefined)).toEqual([]);
    expect(migrateLog(['belly'])).toEqual([]);
  });
});
