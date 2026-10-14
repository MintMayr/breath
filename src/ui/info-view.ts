import type { Mode } from '../core/types';

/** Abschnitt der Seite „Wissen“ zu jeder Übung (IDs in index.html). */
const SECTION: Readonly<Record<Mode, string>> = {
  belly: 'info-belly',
  lips: 'info-lips',
  co2: 'info-co2',
};

/** Klappt den Abschnitt zur Übung auf und scrollt hin. Die Seite muss schon sichtbar sein. */
export function openInfo(mode: Mode): void {
  const details = document.getElementById(SECTION[mode]);
  if (!(details instanceof HTMLDetailsElement)) return;
  details.open = true;
  details.scrollIntoView({ block: 'start' });
  details.querySelector('summary')?.focus({ preventScroll: true });
}
