import { addDays, dateKey } from './dates';
import { formatDuration } from './math';
import { adjacentValue, co2HoldFor } from './settings';
import type { NumericSettingKey } from './settings';
import type { Co2Detail, History, Mode, SessionRecord, Settings } from './types';

/**
 * So viele leichte Einheiten in Folge (mit der aktuellen Einstellung) braucht es,
 * bevor die App vorschlägt zu steigern.
 */
export const EASY_IN_A_ROW: Readonly<Record<Mode, number>> = { belly: 3, lips: 3, co2: 2 };
/** Frühestens nach so vielen Tagen mit derselben Bestzeit wird empfohlen, sie neu zu messen. */
export const BEST_RETEST_DAYS = 14;

export interface Suggestion {
  readonly text: string;
  /** Vorgeschlagene Änderung um genau eine Stufe. Fehlt bei reinen Hinweisen. */
  readonly change?: { readonly key: NumericSettingKey; readonly value: number };
}

/**
 * Vorschlag für die nächste Einheit, abgeleitet aus Bewertung und voll gehaltenen Runden.
 * Höchstens eine Stufe, immer innerhalb von `SETTING_SPECS` und nie automatisch angewendet.
 * Zurückschalten hat Vorrang vor Steigern.
 */
export function suggestion(
  history: History,
  mode: Mode,
  settings: Settings,
  today: Date,
): Suggestion | null {
  const records = history.filter((r) => r.mode === mode);
  if (mode === 'co2') return co2Suggestion(records, settings, today);
  return breathingSuggestion(records, mode, settings);
}

function breathingSuggestion(
  records: readonly SessionRecord[],
  mode: 'belly' | 'lips',
  s: Settings,
): Suggestion | null {
  const key = mode === 'belly' ? 'bellyExhale' : 'lipsExhale';
  const current = s[key];
  const atCurrent = (r: SessionRecord) => r.mode !== 'co2' && r.detail?.exhale === current;

  const last = records.at(-1);
  if (last && atCurrent(last) && last.feel === 'hard') {
    const lower = adjacentValue(key, current, -1);
    if (lower === current) return null;
    return {
      text: `Die letzte Einheit war schwer. Ausatmen wieder auf ${lower} s verkürzen?`,
      change: { key, value: lower },
    };
  }

  const n = EASY_IN_A_ROW[mode];
  const lastN = records.slice(-n);
  if (lastN.length < n || !lastN.every((r) => atCurrent(r) && r.feel === 'easy')) return null;
  const higher = adjacentValue(key, current, 1);
  if (higher === current) return null;
  return {
    text: `Die letzten ${n} Einheiten waren leicht. Ausatmen auf ${higher} s verlängern?`,
    change: { key, value: higher },
  };
}

function co2Suggestion(
  records: readonly SessionRecord[],
  s: Settings,
  today: Date,
): Suggestion | null {
  const hold = co2HoldFor(s);
  const relative = s.co2Basis === 'best';
  const matches = (d: Co2Detail | undefined): d is Co2Detail =>
    d !== undefined && d.hold === hold && (!relative || d.best === s.co2Best);

  const last = records.at(-1);
  const lastDetail = last && co2Detail(last);
  if (last && matches(lastDetail)) {
    const hard = last.feel === 'hard';
    if (hard || lastDetail.fullHolds < lastDetail.rounds / 2) {
      return easeOff(
        hard
          ? 'Die letzte Einheit war schwer.'
          : 'Zuletzt hast du weniger als die Hälfte der Runden voll gehalten.',
        s,
      );
    }
  }

  const n = EASY_IN_A_ROW.co2;
  const lastN = records.slice(-n);
  const allEasy =
    lastN.length === n &&
    lastN.every((r) => {
      const d = co2Detail(r);
      return matches(d) && r.feel === 'easy' && d.fullHolds === d.rounds;
    });
  if (!allEasy) return null;

  if (!relative) {
    const higher = adjacentValue('co2Hold', s.co2Hold, 1);
    if (higher === s.co2Hold) return null;
    return {
      text:
        `Die letzten ${n} Einheiten waren leicht, alle Runden voll gehalten. ` +
        `Haltezeit auf ${formatDuration(higher)} verlängern?`,
      change: { key: 'co2Hold', value: higher },
    };
  }

  // Nach Bestzeit gibt es keine Stufe zum Steigern, nur den Hinweis, die Bestzeit neu zu messen.
  const since = bestInUseSince(records, s.co2Best);
  if (since === null || since > dateKey(addDays(today, -BEST_RETEST_DAYS))) return null;
  return {
    text:
      'Die letzten Einheiten waren leicht und deine Bestzeit ist mindestens zwei Wochen alt. ' +
      'Du kannst sie neu messen, wie unter „Wissen“ beschrieben.',
  };
}

/** Eine Stufe leichter: feste Haltezeit kürzer, sonst eine Runde weniger. */
function easeOff(reason: string, s: Settings): Suggestion {
  if (s.co2Basis === 'fixed') {
    const lower = adjacentValue('co2Hold', s.co2Hold, -1);
    if (lower !== s.co2Hold) {
      return {
        text: `${reason} Haltezeit auf ${formatDuration(lower)} verkürzen?`,
        change: { key: 'co2Hold', value: lower },
      };
    }
  }
  const fewer = adjacentValue('co2Rounds', s.co2Rounds, -1);
  if (fewer !== s.co2Rounds) {
    return {
      text: `${reason} Nächstes Mal ${fewer} statt ${s.co2Rounds} Runden?`,
      change: { key: 'co2Rounds', value: fewer },
    };
  }
  return { text: `${reason} Bleib bei dieser Einstellung, bis es sich leichter anfühlt.` };
}

/** Erster Tag der jüngsten ununterbrochenen Folge von CO₂-Einheiten mit dieser Bestzeit. */
function bestInUseSince(records: readonly SessionRecord[], best: number): string | null {
  let since: string | null = null;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (!r || co2Detail(r)?.best !== best) break;
    since = r.day;
  }
  return since;
}

function co2Detail(r: SessionRecord): Co2Detail | undefined {
  return r.mode === 'co2' ? r.detail : undefined;
}
