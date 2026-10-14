import { describe, expect, it } from 'vitest';
import { clamp, easeInOut, formatDuration } from './math';

describe('formatDuration', () => {
  it('formatiert Minuten und Sekunden', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('rundet und wird nie negativ', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('clamp / easeInOut', () => {
  it('begrenzt Werte', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('easing startet bei 0, endet bei 1 und ist symmetrisch', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});
