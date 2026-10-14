import { clamp } from './math';
import type { Phase } from './types';

export type SessionStatus = 'running' | 'paused' | 'done';

export interface SessionSnapshot {
  readonly index: number;
  readonly phase: Phase;
  /** Verbleibende ganze Sekunden der Phase, nie unter 1 (für die große Anzeige). */
  readonly secondsLeft: number;
  /** Seit Phasenbeginn vergangene Zeit in ms, auf die Phasendauer begrenzt. */
  readonly elapsedMs: number;
  /** Fortschritt der aktuellen Phase, 0–1. */
  readonly phaseProgress: number;
  /** Bereits absolvierte Sekunden der ganzen Einheit (für den Fortschrittsbalken). */
  readonly doneSeconds: number;
  readonly totalSeconds: number;
}

/**
 * Zeitsteuerung einer Übungseinheit, ohne DOM und ohne eigene Uhr:
 * Jede Methode bekommt `now` (ms, monoton, z. B. `performance.now()`) übergeben.
 * Phasenwechsel werden aus absoluten Endzeiten berechnet, nicht durch
 * Aufsummieren von Frame-Deltas – dadurch driftet nichts.
 */
export class Session {
  readonly phases: readonly Phase[];
  readonly totalSeconds: number;
  /** Startsekunde jeder Phase relativ zum Beginn der Einheit. */
  private readonly offsets: readonly number[];
  private currentStatus: SessionStatus = 'running';
  private currentIndex = 0;
  private phaseStart = 0;
  private phaseEnd = 0;
  private pausedAt = 0;
  private cut = 0;

  constructor(phases: readonly Phase[], now: number) {
    if (phases.length === 0) throw new Error('Eine Einheit braucht mindestens eine Phase.');
    this.phases = phases;
    let acc = 0;
    this.offsets = phases.map((p) => {
      const start = acc;
      acc += p.dur;
      return start;
    });
    this.totalSeconds = acc;
    this.enter(0, now);
  }

  get status(): SessionStatus {
    return this.currentStatus;
  }

  get index(): number {
    return this.currentIndex;
  }

  get current(): Phase {
    return this.phaseAt(this.currentIndex);
  }

  /** Haltephasen, die vorzeitig endeten: per „Jetzt atmen“ oder weil im Halten pausiert wurde. */
  get cutHolds(): number {
    return this.cut;
  }

  /**
   * Holt die Zeit bis `now` auf. Auch mehrere abgelaufene Phasen am Stück
   * (z. B. nach einem hängenden Tab) werden korrekt übersprungen.
   * @returns `true`, wenn sich die Phase geändert hat oder die Einheit fertig ist.
   */
  advance(now: number): boolean {
    let changed = false;
    while (this.currentStatus === 'running' && now >= this.phaseEnd) {
      this.next(this.phaseEnd);
      changed = true;
    }
    return changed;
  }

  /** Beendet die aktuelle Phase sofort (z. B. „Jetzt atmen“ beim Luftanhalten). */
  skip(now: number): void {
    if (this.currentStatus !== 'running') return;
    if (this.current.type === 'hold') this.cut++;
    this.next(now);
  }

  pause(now: number): void {
    if (this.currentStatus !== 'running') return;
    this.currentStatus = 'paused';
    this.pausedAt = now;
  }

  /**
   * Setzt die Einheit fort. Wurde beim Luftanhalten pausiert, geht es mit der
   * nächsten Phase weiter: Ein unterbrochenes Halten lässt sich nicht fortsetzen,
   * man hat in der Pause ja geatmet.
   * @returns `true`, wenn dadurch die Phase gewechselt hat.
   */
  resume(now: number): boolean {
    if (this.currentStatus !== 'paused') return false;
    const shift = now - this.pausedAt;
    this.phaseStart += shift;
    this.phaseEnd += shift;
    this.currentStatus = 'running';
    if (this.current.type === 'hold') {
      this.cut++;
      this.next(now);
      return true;
    }
    return false;
  }

  snapshot(now: number): SessionSnapshot {
    const t = this.currentStatus === 'paused' ? this.pausedAt : now;
    const phase = this.current;
    const durMs = phase.dur * 1000;
    const elapsedMs = clamp(t - this.phaseStart, 0, durMs);
    const phaseProgress = durMs > 0 ? elapsedMs / durMs : 1;
    const doneSeconds =
      this.currentStatus === 'done'
        ? this.totalSeconds
        : Math.min(
            this.totalSeconds,
            (this.offsets[this.currentIndex] ?? 0) + phaseProgress * phase.dur,
          );
    return {
      index: this.currentIndex,
      phase,
      secondsLeft: Math.max(1, Math.ceil((this.phaseEnd - t) / 1000)),
      elapsedMs,
      phaseProgress,
      doneSeconds,
      totalSeconds: this.totalSeconds,
    };
  }

  private next(at: number): void {
    if (this.currentIndex + 1 >= this.phases.length) {
      this.currentStatus = 'done';
      return;
    }
    this.enter(this.currentIndex + 1, at);
  }

  private enter(index: number, at: number): void {
    this.currentIndex = index;
    this.phaseStart = at;
    this.phaseEnd = at + this.phaseAt(index).dur * 1000;
  }

  private phaseAt(index: number): Phase {
    const phase = this.phases[index];
    if (!phase) throw new Error(`Keine Phase mit Index ${index}`);
    return phase;
  }
}
