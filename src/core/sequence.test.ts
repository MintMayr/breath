import { describe, expect, it } from 'vitest';
import { buildSequence, co2Rests, totalSeconds } from './sequence';
import { DEFAULT_SETTINGS } from './settings';

describe('co2Rests', () => {
  it('fällt linear von 60 s auf 20 s', () => {
    expect(co2Rests(8)).toEqual([60, 54, 49, 43, 37, 31, 26, 20]);
    expect(co2Rests(4)).toEqual([60, 47, 33, 20]);
  });

  it('kommt mit einer einzigen Runde aus', () => {
    expect(co2Rests(1)).toEqual([60]);
  });
});

describe('buildSequence', () => {
  it('Zwerchfell: Ein/Aus-Paare, die die gewählte Dauer füllen', () => {
    const seq = buildSequence('belly', { ...DEFAULT_SETTINGS, bellyExhale: 6, bellyMinutes: 5 });
    expect(seq).toHaveLength(60); // 300 s / 10 s pro Atemzug = 30 Atemzüge
    expect(seq[0]?.type).toBe('in');
    expect(seq[1]?.type).toBe('out');
    expect(seq[1]?.dur).toBe(6);
    expect(totalSeconds(seq)).toBe(300);
  });

  it('Lippenbremse nutzt 3 s Einatmen', () => {
    const seq = buildSequence('lips', { ...DEFAULT_SETTINGS, lipsExhale: 9, lipsMinutes: 3 });
    expect(seq[0]?.dur).toBe(3);
    expect(seq).toHaveLength(30); // 180 s / 12 s = 15 Atemzüge
  });

  it('CO₂: Erholung, Einatmen, Halten je Runde, danach Ausklingen', () => {
    const s = { ...DEFAULT_SETTINGS, co2Rounds: 4, co2Hold: 45 };
    const seq = buildSequence('co2', s);
    expect(seq).toHaveLength(4 * 3 + 1);
    expect(seq.map((p) => p.type).slice(0, 3)).toEqual(['rest', 'in', 'hold']);
    expect(seq.filter((p) => p.type === 'hold').every((p) => p.dur === 45)).toBe(true);
    expect(seq.at(-1)?.type).toBe('settle');
    // Erholung + Einatmen ergeben zusammen genau die Pausenzeit der Tabelle.
    expect((seq[0]?.dur ?? 0) + (seq[1]?.dur ?? 0)).toBe(60);
    expect(totalSeconds(seq)).toBe(60 + 47 + 33 + 20 + 4 * 45 + 30);
  });

  it('CO₂ nach Bestzeit hält die Hälfte der Bestzeit', () => {
    const s = { ...DEFAULT_SETTINGS, co2Basis: 'best' as const, co2Best: 150 };
    const holds = buildSequence('co2', s).filter((p) => p.type === 'hold');
    expect(holds.every((p) => p.dur === 75)).toBe(true);
  });

  it('nummeriert CO₂-Runden ab 1', () => {
    const seq = buildSequence('co2', { ...DEFAULT_SETTINGS, co2Rounds: 5 });
    expect(seq.filter((p) => p.type === 'hold').map((p) => p.round)).toEqual([1, 2, 3, 4, 5]);
  });
});
