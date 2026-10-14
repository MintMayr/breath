import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import {
  EMPTY_DATA,
  mergeData,
  parseImport,
  parseStoredData,
  serializeStoredData,
} from './stored-data';
import type { StoredData } from './stored-data';

describe('parseImport', () => {
  it('lehnt alles ab, was keine Sicherung ist', () => {
    for (const raw of ['', '{kaputt', '42', '[]', '{}', '{"settings":{}}', '{"version":3}']) {
      expect(parseImport(raw)).toBeNull();
    }
  });

  it('liest Sicherungen im Format v3 und v2', () => {
    const v3 = serializeStoredData({
      settings: { ...DEFAULT_SETTINGS, co2Rounds: 5 },
      history: [{ at: 1, day: '2026-10-12', mode: 'belly' }],
    });
    expect(parseImport(v3)).toMatchObject({ settings: { co2Rounds: 5 }, history: [{ at: 1 }] });

    const v2 = JSON.stringify({ version: 2, settings: {}, log: { '2026-10-12': ['lips'] } });
    expect(parseImport(v2)?.history.map((r) => r.mode)).toEqual(['lips']);
  });

  it('bereinigt den Inhalt wie beim Laden', () => {
    const raw = JSON.stringify({
      version: 3,
      settings: { co2Hold: 9999 },
      history: [{ at: 1, day: 'gestern', mode: 'belly' }],
    });
    expect(parseImport(raw)).toEqual({
      settings: { ...DEFAULT_SETTINGS, co2Hold: 120 },
      history: [],
    });
  });
});

describe('mergeData', () => {
  it('führt Verläufe ohne Duplikate zusammen und übernimmt die Einstellungen der Datei', () => {
    const current: StoredData = {
      settings: DEFAULT_SETTINGS,
      history: [
        { at: 1, day: '2026-10-12', mode: 'belly' },
        { at: 2, day: '2026-10-12', mode: 'co2' },
      ],
    };
    const imported: StoredData = {
      settings: { ...DEFAULT_SETTINGS, signal: 'voice' },
      history: [
        { at: 2, day: '2026-10-12', mode: 'co2' },
        { at: 3, day: '2026-10-13', mode: 'lips' },
      ],
    };
    const merged = mergeData(current, imported);
    expect(merged.settings.signal).toBe('voice');
    expect(merged.history.map((r) => r.at)).toEqual([1, 2, 3]);
    expect(mergeData(merged, imported)).toEqual(merged);
  });
});

describe('parseStoredData', () => {
  it('liefert Standarddaten, wenn nichts oder Kaputtes gespeichert ist', () => {
    expect(parseStoredData(null)).toEqual(EMPTY_DATA);
    expect(parseStoredData('{kaputt')).toEqual(EMPTY_DATA);
    expect(parseStoredData('42')).toEqual(EMPTY_DATA);
  });

  it('übersteht einen Roundtrip', () => {
    const data: StoredData = {
      settings: { ...DEFAULT_SETTINGS, co2Hold: 45, signal: 'off' },
      history: [
        {
          at: 1_000,
          day: '2026-10-12',
          mode: 'belly',
          feel: 'easy',
          detail: { seconds: 300, exhale: 6 },
        },
        {
          at: 2_000,
          day: '2026-10-12',
          mode: 'co2',
          detail: { seconds: 560, hold: 45, rounds: 8, fullHolds: 7 },
        },
      ],
    };
    expect(parseStoredData(serializeStoredData(data))).toEqual(data);
  });

  it('speichert eine Formatversion mit', () => {
    expect(JSON.parse(serializeStoredData(EMPTY_DATA))).toMatchObject({ version: 3 });
  });

  it('übernimmt den Verlauf aus Format v2 als Einheiten ohne Details', () => {
    const v2 = JSON.stringify({
      version: 2,
      settings: { ...DEFAULT_SETTINGS, co2Rounds: 6 },
      log: { '2026-10-12': ['belly', 'co2'], '2026-10-13': ['lips'] },
    });
    const data = parseStoredData(v2);
    expect(data.settings.co2Rounds).toBe(6);
    expect(data.history.map((r) => [r.day, r.mode, r.detail])).toEqual([
      ['2026-10-12', 'belly', undefined],
      ['2026-10-12', 'co2', undefined],
      ['2026-10-13', 'lips', undefined],
    ]);
  });

  it('liest eine unbekannte neuere Version bestmöglich statt den Verlauf zu verwerfen', () => {
    const v9 = JSON.stringify({
      version: 9,
      history: [{ at: 5, day: '2026-10-12', mode: 'lips', extra: true }],
    });
    expect(parseStoredData(v9).history).toEqual([{ at: 5, day: '2026-10-12', mode: 'lips' }]);
  });
});
