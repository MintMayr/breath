import { clamp } from './math';
import { isRecord } from './types';
import type { Co2Basis, Settings, Signal } from './types';

export type NumericSettingKey = Exclude<keyof Settings, 'signal' | 'co2Basis'>;

/** Auswahl aus festen Werten (Segment-Buttons). */
interface ChoiceSpec {
  readonly kind: 'choice';
  readonly options: readonly number[];
}

/** Stufenloser Bereich mit Schrittweite (Plus/Minus-Stepper). */
interface RangeSpec {
  readonly kind: 'range';
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type SettingSpec = ChoiceSpec | RangeSpec;

/** Einzige Quelle für erlaubte Werte. UI und Validierung lesen beide hier. */
export const SETTING_SPECS: Readonly<Record<NumericSettingKey, SettingSpec>> = {
  bellyExhale: { kind: 'choice', options: [6, 7, 8] },
  bellyMinutes: { kind: 'choice', options: [5, 10] },
  lipsExhale: { kind: 'range', min: 6, max: 12, step: 1 },
  lipsMinutes: { kind: 'choice', options: [3, 5] },
  co2Hold: { kind: 'range', min: 15, max: 120, step: 5 },
  co2Rounds: { kind: 'range', min: 4, max: 10, step: 1 },
  co2Best: { kind: 'range', min: 30, max: 360, step: 5 },
};

export const SIGNALS: readonly Signal[] = ['tone', 'voice', 'off'];
export const CO2_BASES: readonly Co2Basis[] = ['fixed', 'best'];

/** Klassische CO₂-Tabellen halten etwa die Hälfte der persönlichen Bestzeit. */
export const CO2_BEST_PERCENT = 50;

export const DEFAULT_SETTINGS: Settings = {
  bellyExhale: 6,
  bellyMinutes: 5,
  lipsExhale: 8,
  lipsMinutes: 5,
  co2Hold: 30,
  co2Rounds: 8,
  co2Basis: 'fixed',
  // 50 % von 1:00 ergibt dieselben 0:30 wie die feste Standard-Haltezeit.
  co2Best: 60,
  signal: 'tone',
};

export const NUMERIC_SETTING_KEYS = Object.keys(SETTING_SPECS) as NumericSettingKey[];

/** Bringt einen beliebigen Wert in den erlaubten Bereich; Unbrauchbares wird zum Standardwert. */
export function normalizeValue(key: NumericSettingKey, raw: unknown): number {
  const fallback = DEFAULT_SETTINGS[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const spec = SETTING_SPECS[key];
  if (spec.kind === 'choice') return spec.options.includes(raw) ? raw : fallback;
  const snapped = spec.min + Math.round((raw - spec.min) / spec.step) * spec.step;
  return clamp(snapped, spec.min, spec.max);
}

/** Nächster Wert eines Steppers; bleibt an den Grenzen stehen. */
export function stepValue(key: NumericSettingKey, current: number, direction: 1 | -1): number {
  const spec = SETTING_SPECS[key];
  if (spec.kind !== 'range') throw new Error(`${key} ist kein Bereichswert`);
  return normalizeValue(key, current + direction * spec.step);
}

/** Nächstgrößerer bzw. -kleinerer erlaubter Wert, für Auswahl- wie Bereichswerte. Bleibt an den Grenzen stehen. */
export function adjacentValue(key: NumericSettingKey, current: number, direction: 1 | -1): number {
  const spec = SETTING_SPECS[key];
  if (spec.kind === 'range') return stepValue(key, current, direction);
  const ascending = [...spec.options].sort((a, b) => a - b);
  const next =
    direction > 0 ? ascending.find((v) => v > current) : ascending.findLast((v) => v < current);
  return next ?? current;
}

export function isSignal(value: unknown): value is Signal {
  return typeof value === 'string' && (SIGNALS as readonly string[]).includes(value);
}

export function isCo2Basis(value: unknown): value is Co2Basis {
  return typeof value === 'string' && (CO2_BASES as readonly string[]).includes(value);
}

/**
 * Haltezeit aus der Bestzeit: der klassische Anteil, eingerastet in die erlaubten
 * Haltezeiten. Dadurch gelten deren Grenzen (15 s bis 2:00) auch hier.
 */
export function holdFromBest(best: number): number {
  return normalizeValue('co2Hold', (best * CO2_BEST_PERCENT) / 100);
}

/** Ob die Haltezeit aus der Bestzeit durch die Obergrenze gekappt wird. */
export function isHoldFromBestCapped(best: number): boolean {
  const spec = SETTING_SPECS.co2Hold;
  return spec.kind === 'range' && (best * CO2_BEST_PERCENT) / 100 > spec.max;
}

/** Die Haltezeit, mit der eine CO₂-Einheit tatsächlich läuft. */
export function co2HoldFor(s: Settings): number {
  return s.co2Basis === 'best' ? holdFromBest(s.co2Best) : s.co2Hold;
}

export function sanitizeSettings(raw: unknown): Settings {
  const src: Record<string, unknown> = isRecord(raw) ? raw : {};
  const numeric = Object.fromEntries(
    NUMERIC_SETTING_KEYS.map((key) => [key, normalizeValue(key, src[key])]),
  ) as Record<NumericSettingKey, number>;
  return {
    ...numeric,
    co2Basis: isCo2Basis(src.co2Basis) ? src.co2Basis : DEFAULT_SETTINGS.co2Basis,
    signal: isSignal(src.signal) ? src.signal : DEFAULT_SETTINGS.signal,
  };
}
