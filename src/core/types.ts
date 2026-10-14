/** Die drei Übungen. `belly` ist die tägliche Grundübung, die anderen sind Zusatzübungen. */
export type Mode = 'belly' | 'co2' | 'lips';
export type ExtraMode = Exclude<Mode, 'belly'>;

export type PhaseType = 'in' | 'out' | 'hold' | 'rest' | 'settle';
export type CueType = PhaseType | 'done';
export type Signal = 'tone' | 'voice' | 'off';
/** Woraus sich die CO₂-Haltezeit ergibt: feste Zeit oder Anteil der Bestzeit. */
export type Co2Basis = 'fixed' | 'best';

export interface Phase {
  readonly type: PhaseType;
  /** Dauer in Sekunden. */
  readonly dur: number;
  /** Runde (1-basiert), nur im CO₂-Modus gesetzt. */
  readonly round?: number;
  readonly hint: string;
}

export interface Settings {
  /** Ausatemzeit Zwerchfellatmung in s. */
  readonly bellyExhale: number;
  readonly bellyMinutes: number;
  /** Ausatemzeit Lippenbremse in s. */
  readonly lipsExhale: number;
  readonly lipsMinutes: number;
  /** Feste Haltezeit pro CO₂-Runde in s (bei `co2Basis: 'fixed'`). */
  readonly co2Hold: number;
  readonly co2Rounds: number;
  readonly co2Basis: Co2Basis;
  /** Persönliche Bestzeit im Luftanhalten in s (bei `co2Basis: 'best'`). */
  readonly co2Best: number;
  readonly signal: Signal;
}

/** Selbsteinschätzung nach einer Einheit. */
export type Feel = 'easy' | 'ok' | 'hard';

export interface BreathingDetail {
  /** Geplante Dauer der Einheit in s. */
  readonly seconds: number;
  /** Ausatemzeit in s. */
  readonly exhale: number;
}

export interface Co2Detail {
  readonly seconds: number;
  /** Tatsächlich verwendete Haltezeit pro Runde in s. */
  readonly hold: number;
  readonly rounds: number;
  /** Runden, die bis zum Ende gehalten wurden (also ohne vorzeitiges „Jetzt atmen“). */
  readonly fullHolds: number;
  /** Bestzeit in s, falls die Haltezeit daraus berechnet wurde. */
  readonly best?: number;
}

interface RecordBase {
  /** Startzeit in ms seit 1970. Dient zugleich als eindeutige ID. */
  readonly at: number;
  /** Lokaler Kalendertag des Starts, `YYYY-MM-DD`. */
  readonly day: string;
  readonly feel?: Feel;
}

/**
 * Eine abgeschlossene Einheit. `detail` fehlt nur bei Einträgen aus Format v2,
 * das sich lediglich „an dem Tag erledigt“ gemerkt hat.
 */
export type SessionRecord =
  | (RecordBase & { readonly mode: 'belly' | 'lips'; readonly detail?: BreathingDetail })
  | (RecordBase & { readonly mode: 'co2'; readonly detail?: Co2Detail });

/** Alle Einheiten, aufsteigend nach `at` sortiert. */
export type History = readonly SessionRecord[];

export const MODES: readonly Mode[] = ['belly', 'co2', 'lips'];
export const FEELS: readonly Feel[] = ['easy', 'ok', 'hard'];

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

export function isFeel(value: unknown): value is Feel {
  return typeof value === 'string' && (FEELS as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
