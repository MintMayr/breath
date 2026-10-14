/** Alle Funktionen arbeiten in lokaler Zeit. Woche beginnt am Montag (Index 0). */

export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const DAY_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;
export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
] as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Montag = 0 … Sonntag = 6. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function dateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function isDateKey(value: string): boolean {
  return DATE_KEY.test(value);
}

/** Gegenstück zu `dateKey`: der Tag um 12:00 Uhr lokaler Zeit. Erwartet einen gültigen Schlüssel. */
export function parseDateKey(key: string): Date {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Ganze Kalendertage von `a` bis `b`. Rechnet mit UTC-Datumswerten, daher ohne Sommerzeit-Versatz. */
export function daysBetween(a: Date, b: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** Verschiebt um ganze Kalendertage (über Jahr/Monat/Tag, daher sommerzeitfest). Ergebnis um 12:00 Uhr. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

/**
 * Die sieben Tage (Mo–So) der Woche, in der `date` liegt, jeweils 12:00 Uhr.
 * Gebaut über Jahr/Monat/Tag statt Millisekunden-Arithmetik, damit
 * Sommerzeitumstellungen keine Tage verschieben.
 */
export function weekDays(date: Date): Date[] {
  const y = date.getFullYear();
  const m = date.getMonth();
  const monday = date.getDate() - weekdayIndex(date);
  return Array.from({ length: 7 }, (_, i) => new Date(y, m, monday + i, 12));
}

export function dayLong(date: Date): string {
  return DAY_LONG[weekdayIndex(date)] ?? '';
}

/** Kurzes Datum wie „Mi, 8. Okt“. */
export function shortDate(date: Date): string {
  const day = DAY_SHORT[weekdayIndex(date)] ?? '';
  return `${day}, ${date.getDate()}. ${MONTH_SHORT[date.getMonth()] ?? ''}`;
}
