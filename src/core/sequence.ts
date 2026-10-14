import { co2HoldFor } from './settings';
import type { Mode, Phase, Settings } from './types';

/** Einatemzeiten in Sekunden. */
const INHALE = { belly: 4, lips: 3, co2: 4 } as const;
const SETTLE_SECONDS = 30;

/** Erholung vor dem ersten Halten bzw. vor der letzten Runde (CO₂-Tabelle). */
const CO2_REST_FIRST = 60;
const CO2_REST_LAST = 20;

/**
 * Erholungszeiten einer CO₂-Tabelle: linear fallend von 60 s auf 20 s,
 * die Haltezeit bleibt konstant. Die 4 s Einatmen sind in der Erholung enthalten.
 */
export function co2Rests(rounds: number): number[] {
  const span = CO2_REST_FIRST - CO2_REST_LAST;
  return Array.from({ length: rounds }, (_, i) =>
    Math.round(CO2_REST_FIRST - (span * i) / Math.max(1, rounds - 1)),
  );
}

function breathing(
  minutes: number,
  inhale: number,
  exhale: number,
  hints: [string, string],
): Phase[] {
  const breaths = Math.max(1, Math.round((minutes * 60) / (inhale + exhale)));
  return Array.from({ length: breaths }, (): Phase[] => [
    { type: 'in', dur: inhale, hint: hints[0] },
    { type: 'out', dur: exhale, hint: hints[1] },
  ]).flat();
}

export function buildSequence(mode: Mode, s: Settings): Phase[] {
  switch (mode) {
    case 'belly':
      return breathing(s.bellyMinutes, INHALE.belly, s.bellyExhale, [
        'Durch die Nase, der Bauch hebt sich. Die Brust bleibt ruhig.',
        'Langsam durch locker geschlossene Lippen ausströmen lassen.',
      ]);
    case 'lips':
      return breathing(s.lipsMinutes, INHALE.lips, s.lipsExhale, [
        'Kurz und ruhig durch die Nase.',
        'Gegen den leichten Widerstand der Lippen, gleichmäßig bis zum Ende.',
      ]);
    case 'co2': {
      const rests = co2Rests(s.co2Rounds);
      const phases = rests.flatMap((rest, i): Phase[] => [
        {
          type: 'rest',
          dur: rest - INHALE.co2,
          round: i + 1,
          hint:
            i === 0
              ? 'Bequem hinsetzen, ruhig und normal atmen.'
              : 'Ruhig weiteratmen, nicht hecheln.',
        },
        { type: 'in', dur: INHALE.co2, round: i + 1, hint: 'Ruhig einatmen, nicht voll pumpen.' },
        {
          type: 'hold',
          dur: co2HoldFor(s),
          round: i + 1,
          hint: 'Kiefer und Schultern locker. Wenn es zu viel wird: einfach atmen.',
        },
      ]);
      phases.push({
        type: 'settle',
        dur: SETTLE_SECONDS,
        round: rests.length,
        hint: 'Normal weiteratmen und nachspüren.',
      });
      return phases;
    }
  }
}

export function totalSeconds(phases: readonly Phase[]): number {
  return phases.reduce((sum, p) => sum + p.dur, 0);
}

export function inhaleSeconds(mode: Mode): number {
  return INHALE[mode];
}
