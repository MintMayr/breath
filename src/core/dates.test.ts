import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKey,
  daysBetween,
  isDateKey,
  parseDateKey,
  shortDate,
  weekDays,
  weekdayIndex,
} from './dates';

// Alle Daten als lokale Zeit konstruiert, damit die Tests in jeder Zeitzone gleich laufen.
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('weekdayIndex', () => {
  it('beginnt die Woche am Montag', () => {
    expect(weekdayIndex(day(2026, 10, 12))).toBe(0); // Montag
    expect(weekdayIndex(day(2026, 10, 18))).toBe(6); // Sonntag
  });
});

describe('dateKey', () => {
  it('liefert YYYY-MM-DD mit führenden Nullen in lokaler Zeit', () => {
    expect(dateKey(day(2026, 3, 7))).toBe('2026-03-07');
    expect(dateKey(day(2026, 12, 31, 23))).toBe('2026-12-31');
    expect(dateKey(day(2027, 1, 1, 0))).toBe('2027-01-01');
  });

  it('isDateKey erkennt das Format', () => {
    expect(isDateKey('2026-10-12')).toBe(true);
    expect(isDateKey('2026-1-12')).toBe(false);
    expect(isDateKey('__proto__')).toBe(false);
  });

  it('parseDateKey liefert den Tag um 12 Uhr lokal', () => {
    const d = parseDateKey('2026-03-07');
    expect(d).toEqual(day(2026, 3, 7));
    expect(dateKey(d)).toBe('2026-03-07');
  });
});

describe('daysBetween', () => {
  it('zählt Kalendertage, unabhängig von Uhrzeit und Zeitumstellung', () => {
    expect(daysBetween(day(2026, 10, 24, 23), day(2026, 10, 26, 1))).toBe(2);
    expect(daysBetween(day(2026, 3, 28), day(2026, 3, 30))).toBe(2);
    expect(daysBetween(day(2026, 12, 31), day(2026, 1, 1))).toBe(-364);
  });
});

describe('shortDate', () => {
  it('formatiert kurz auf Deutsch', () => {
    expect(shortDate(day(2026, 10, 8))).toBe('Do, 8. Okt');
  });
});

describe('addDays', () => {
  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(dateKey(addDays(day(2026, 12, 31), 1))).toBe('2027-01-01');
    expect(dateKey(addDays(day(2026, 3, 1), -1))).toBe('2026-02-28');
  });

  it('verliert über die Zeitumstellung keinen Tag', () => {
    // 25.10.2026: Umstellung auf Winterzeit (in Mitteleuropa), 29.03.2026: auf Sommerzeit
    expect(dateKey(addDays(day(2026, 10, 25, 0), 1))).toBe('2026-10-26');
    expect(dateKey(addDays(day(2026, 3, 29, 23), -1))).toBe('2026-03-28');
    expect(dateKey(addDays(day(2026, 10, 1), 30))).toBe('2026-10-31');
  });
});

describe('weekDays', () => {
  it('liefert Mo–So der Woche, auch vom Sonntag aus', () => {
    const keys = weekDays(day(2026, 10, 18)).map(dateKey);
    expect(keys).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });

  it('übersteht Monats- und Jahreswechsel', () => {
    const keys = weekDays(day(2027, 1, 1)).map(dateKey); // Freitag
    expect(keys[0]).toBe('2026-12-28');
    expect(keys[6]).toBe('2027-01-03');
  });

  it('verschiebt bei Zeitumstellung keine Tage (Woche mit 25.10.2026)', () => {
    const keys = weekDays(day(2026, 10, 25, 0)).map(dateKey);
    expect(keys[0]).toBe('2026-10-19');
    expect(keys[6]).toBe('2026-10-25');
    expect(new Set(keys).size).toBe(7);
  });
});
