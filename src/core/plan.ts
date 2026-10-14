import { dayLong, weekdayIndex } from './dates';
import type { ExtraMode, Mode } from './types';

export const MODE_NAMES: Readonly<Record<Mode, string>> = {
  belly: 'Zwerchfellatmung',
  co2: 'CO₂-Toleranz',
  lips: 'Lippenbremse',
};

/** Wochenplan: Zwerchfellatmung jeden Tag, dazu an Werktagen abwechselnd eine Zusatzübung. */
const EXTRA_BY_WEEKDAY: readonly (ExtraMode | null)[] = [
  'co2',
  'lips',
  'co2',
  'lips',
  'co2',
  null,
  null,
];

export function extraFor(date: Date): ExtraMode | null {
  return EXTRA_BY_WEEKDAY[weekdayIndex(date)] ?? null;
}

/** Geplante Übungen eines Tages in empfohlener Reihenfolge. */
export function plannedModes(date: Date): Mode[] {
  const extra = extraFor(date);
  return extra ? ['belly', extra] : ['belly'];
}

/** Nächste geplante, noch offene Übung – oder `null`, wenn der Tag erledigt ist. */
export function nextPlannedMode(done: readonly Mode[], date: Date): Mode | null {
  return plannedModes(date).find((m) => !done.includes(m)) ?? null;
}

/** Übung, die beim Öffnen der App vorausgewählt wird. */
export function suggestedMode(done: readonly Mode[], date: Date): Mode {
  return nextPlannedMode(done, date) ?? 'belly';
}

export function dayPlanText(date: Date): string {
  const extra = extraFor(date);
  return extra
    ? `${dayLong(date)}: Zwerchfellatmung, dazu ${MODE_NAMES[extra]}.`
    : `${dayLong(date)}: nur Zwerchfellatmung, ganz locker.`;
}
