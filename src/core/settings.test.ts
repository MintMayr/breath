import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  NUMERIC_SETTING_KEYS,
  adjacentValue,
  co2HoldFor,
  holdFromBest,
  isHoldFromBestCapped,
  normalizeValue,
  sanitizeSettings,
  stepValue,
} from './settings';

describe('DEFAULT_SETTINGS', () => {
  it('erfüllt die eigenen Regeln', () => {
    for (const key of NUMERIC_SETTING_KEYS) {
      expect(normalizeValue(key, DEFAULT_SETTINGS[key])).toBe(DEFAULT_SETTINGS[key]);
    }
  });
});

describe('normalizeValue', () => {
  it('akzeptiert nur erlaubte Auswahlwerte', () => {
    expect(normalizeValue('bellyExhale', 7)).toBe(7);
    expect(normalizeValue('bellyExhale', 9)).toBe(DEFAULT_SETTINGS.bellyExhale);
  });

  it('begrenzt Bereiche und rastet auf die Schrittweite ein', () => {
    expect(normalizeValue('co2Hold', 500)).toBe(120);
    expect(normalizeValue('co2Hold', 3)).toBe(15);
    expect(normalizeValue('co2Hold', 37)).toBe(35);
  });

  it('ersetzt Nicht-Zahlen durch den Standard', () => {
    for (const bad of ['40', null, undefined, NaN, Infinity, {}]) {
      expect(normalizeValue('co2Hold', bad)).toBe(DEFAULT_SETTINGS.co2Hold);
    }
  });
});

describe('stepValue', () => {
  it('zählt in Schritten und bleibt an den Grenzen stehen', () => {
    expect(stepValue('co2Hold', 30, 1)).toBe(35);
    expect(stepValue('co2Hold', 120, 1)).toBe(120);
    expect(stepValue('co2Rounds', 4, -1)).toBe(4);
  });

  it('lehnt Auswahlwerte ab', () => {
    expect(() => stepValue('bellyMinutes', 5, 1)).toThrow();
  });
});

describe('adjacentValue', () => {
  it('geht bei Auswahlwerten zur nächsten Option und bleibt am Rand stehen', () => {
    expect(adjacentValue('bellyExhale', 6, 1)).toBe(7);
    expect(adjacentValue('bellyExhale', 8, 1)).toBe(8);
    expect(adjacentValue('bellyExhale', 6, -1)).toBe(6);
    expect(adjacentValue('bellyExhale', 8, -1)).toBe(7);
  });

  it('nutzt bei Bereichen die Schrittweite', () => {
    expect(adjacentValue('co2Hold', 30, 1)).toBe(35);
    expect(adjacentValue('co2Hold', 15, -1)).toBe(15);
  });
});

describe('sanitizeSettings', () => {
  it('liefert Standardwerte für Müll', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('übernimmt gültige Werte, verwirft ungültige und unbekannte Felder', () => {
    const s = sanitizeSettings({ co2Hold: 60, bellyMinutes: 7, signal: 'voice', evil: true });
    expect(s.co2Hold).toBe(60);
    expect(s.bellyMinutes).toBe(DEFAULT_SETTINGS.bellyMinutes);
    expect(s.signal).toBe('voice');
    expect('evil' in s).toBe(false);
  });

  it('prüft Haltezeit-Basis und Bestzeit', () => {
    expect(sanitizeSettings({ co2Basis: 'best', co2Best: 92 })).toMatchObject({
      co2Basis: 'best',
      co2Best: 90,
    });
    expect(sanitizeSettings({ co2Basis: 'max', co2Best: 5000 })).toMatchObject({
      co2Basis: 'fixed',
      co2Best: 360,
    });
  });

  it('lässt ältere Einstellungen ohne Bestzeit bei der festen Haltezeit', () => {
    const s = sanitizeSettings({ co2Hold: 45 });
    expect(s.co2Basis).toBe('fixed');
    expect(co2HoldFor(s)).toBe(45);
  });
});

describe('Haltezeit aus der Bestzeit', () => {
  it('nimmt die Hälfte und rastet auf 5 s ein', () => {
    expect(holdFromBest(90)).toBe(45);
    expect(holdFromBest(95)).toBe(50); // 47,5 s
    expect(holdFromBest(60)).toBe(DEFAULT_SETTINGS.co2Hold);
  });

  it('bleibt in den Grenzen der festen Haltezeit', () => {
    expect(holdFromBest(30)).toBe(15);
    expect(holdFromBest(360)).toBe(120);
    expect(isHoldFromBestCapped(360)).toBe(true);
    expect(isHoldFromBestCapped(240)).toBe(false);
  });

  it('wird nur bei Basis „Bestzeit“ verwendet', () => {
    const s = { ...DEFAULT_SETTINGS, co2Hold: 40, co2Best: 120 };
    expect(co2HoldFor(s)).toBe(40);
    expect(co2HoldFor({ ...s, co2Basis: 'best' })).toBe(60);
  });
});
