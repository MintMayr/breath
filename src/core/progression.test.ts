import { describe, expect, it } from 'vitest';
import { suggestion } from './progression';
import { DEFAULT_SETTINGS } from './settings';
import type { Feel, SessionRecord, Settings } from './types';

const today = new Date(2026, 9, 20, 12);
let nextAt = 1;

function breath(exhale: number, feel?: Feel, mode: 'belly' | 'lips' = 'belly'): SessionRecord {
  return {
    at: nextAt++,
    day: '2026-10-19',
    mode,
    ...(feel ? { feel } : {}),
    detail: { seconds: 300, exhale },
  };
}

interface Co2Opts {
  hold?: number;
  rounds?: number;
  full?: number;
  feel?: Feel;
  best?: number;
  day?: string;
}

function co2({ hold = 30, rounds = 8, full = rounds, feel, best, day = '2026-10-19' }: Co2Opts) {
  const detail = { seconds: 500, hold, rounds, fullHolds: full };
  const record: SessionRecord = {
    at: nextAt++,
    day,
    mode: 'co2',
    ...(feel ? { feel } : {}),
    detail: best === undefined ? detail : { ...detail, best },
  };
  return record;
}

const fixed = (hold: number, extra: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  co2Basis: 'fixed',
  co2Hold: hold,
  ...extra,
});
const relative = (best: number): Settings => ({
  ...DEFAULT_SETTINGS,
  co2Basis: 'best',
  co2Best: best,
});

describe('suggestion: Atemübungen', () => {
  const s = { ...DEFAULT_SETTINGS, bellyExhale: 6 };

  it('schweigt ohne Verlauf oder ohne Bewertung', () => {
    expect(suggestion([], 'belly', s, today)).toBeNull();
    expect(suggestion([breath(6), breath(6), breath(6)], 'belly', s, today)).toBeNull();
  });

  it('schlägt nach drei leichten Einheiten eine Sekunde mehr vor', () => {
    const h = [breath(6, 'easy'), breath(6, 'easy'), breath(6, 'easy')];
    expect(suggestion(h, 'belly', s, today)?.change).toEqual({ key: 'bellyExhale', value: 7 });
    expect(suggestion(h.slice(1), 'belly', s, today)).toBeNull();
  });

  it('zählt nur Einheiten mit der aktuellen Einstellung und der gleichen Übung', () => {
    const h = [breath(6, 'easy'), breath(6, 'easy'), breath(7, 'easy')];
    expect(suggestion(h, 'belly', s, today)).toBeNull();
    const lips = [breath(6, 'easy', 'lips'), breath(6, 'easy'), breath(6, 'easy')];
    expect(suggestion(lips, 'belly', s, today)).toBeNull();
  });

  it('schlägt an der Obergrenze nichts vor', () => {
    const h = [breath(8, 'easy'), breath(8, 'easy'), breath(8, 'easy')];
    expect(suggestion(h, 'belly', { ...s, bellyExhale: 8 }, today)).toBeNull();
  });

  it('schlägt nach einer schweren Einheit eine Stufe zurück vor', () => {
    const h = [breath(6, 'easy'), breath(7, 'hard')];
    const result = suggestion(h, 'belly', { ...s, bellyExhale: 7 }, today);
    expect(result?.change).toEqual({ key: 'bellyExhale', value: 6 });
    expect(result?.text).toContain('schwer');
  });

  it('schweigt, wenn nach der schweren Einheit schon zurückgestellt wurde', () => {
    expect(suggestion([breath(7, 'hard')], 'belly', s, today)).toBeNull();
  });
});

describe('suggestion: CO₂ mit fester Haltezeit', () => {
  it('schlägt nach zwei leichten Einheiten mit allen Runden 5 s mehr vor', () => {
    const h = [co2({ feel: 'easy' }), co2({ feel: 'easy' })];
    expect(suggestion(h, 'co2', fixed(30), today)?.change).toEqual({ key: 'co2Hold', value: 35 });
  });

  it('steigert nicht, wenn einmal früh geatmet wurde', () => {
    const h = [co2({ feel: 'easy' }), co2({ feel: 'easy', full: 7 })];
    expect(suggestion(h, 'co2', fixed(30), today)).toBeNull();
  });

  it('steigert nicht über 2:00', () => {
    const h = [co2({ hold: 120, feel: 'easy' }), co2({ hold: 120, feel: 'easy' })];
    expect(suggestion(h, 'co2', fixed(120), today)).toBeNull();
  });

  it('schlägt nach einer schweren Einheit 5 s weniger vor', () => {
    const result = suggestion([co2({ feel: 'hard' })], 'co2', fixed(30), today);
    expect(result?.change).toEqual({ key: 'co2Hold', value: 25 });
  });

  it('schlägt weniger vor, wenn weniger als die Hälfte voll gehalten wurde', () => {
    const result = suggestion([co2({ feel: 'ok', full: 3 })], 'co2', fixed(30), today);
    expect(result?.change).toEqual({ key: 'co2Hold', value: 25 });
    expect(result?.text).toContain('Hälfte');
  });

  it('nimmt an der Untergrenze der Haltezeit eine Runde weg', () => {
    const result = suggestion([co2({ hold: 15, feel: 'hard' })], 'co2', fixed(15), today);
    expect(result?.change).toEqual({ key: 'co2Rounds', value: 7 });
  });

  it('gibt ganz unten nur einen Hinweis ohne Änderung', () => {
    const h = [co2({ hold: 15, rounds: 4, feel: 'hard' })];
    const result = suggestion(h, 'co2', fixed(15, { co2Rounds: 4 }), today);
    expect(result?.change).toBeUndefined();
    expect(result?.text).toContain('schwer');
  });
});

describe('suggestion: CO₂ nach Bestzeit', () => {
  it('empfiehlt frühestens nach zwei Wochen, die Bestzeit neu zu messen', () => {
    const old = [
      co2({ hold: 45, best: 90, feel: 'ok', day: '2026-10-01' }),
      co2({ hold: 45, best: 90, feel: 'easy', day: '2026-10-15' }),
      co2({ hold: 45, best: 90, feel: 'easy', day: '2026-10-19' }),
    ];
    const result = suggestion(old, 'co2', relative(90), today);
    expect(result?.change).toBeUndefined();
    expect(result?.text).toContain('neu messen');

    const recent = old.map((r) => ({ ...r, day: '2026-10-12' }));
    expect(suggestion(recent, 'co2', relative(90), today)).toBeNull();
  });

  it('schlägt nach einer schweren Einheit eine Runde weniger vor', () => {
    const h = [co2({ hold: 45, best: 90, feel: 'hard' })];
    expect(suggestion(h, 'co2', relative(90), today)?.change).toEqual({
      key: 'co2Rounds',
      value: 7,
    });
  });
});
