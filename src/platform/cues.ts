import type { CueType, Signal } from '../core/types';
import { Speaker } from './speech';
import { TonePlayer } from './tones';

const TONES: Readonly<Record<CueType, readonly (readonly [number, number])[]>> = {
  in: [
    [523, 0],
    [659, 0.13],
  ],
  out: [
    [587, 0],
    [440, 0.13],
  ],
  hold: [
    [784, 0],
    [784, 0.22],
  ],
  rest: [[440, 0]],
  settle: [[440, 0]],
  done: [
    [523, 0],
    [659, 0.15],
    [784, 0.3],
  ],
};

const SPOKEN: Readonly<Record<CueType, string>> = {
  in: 'Einatmen',
  out: 'Ausatmen',
  hold: 'Halten',
  rest: 'Erholen',
  settle: 'Ausklingen',
  done: 'Geschafft',
};

/** Signale bei Phasenwechseln: Ton oder Stimme je nach Einstellung, dazu Vibration. */
export class Cues {
  private readonly tones = new TonePlayer();
  private readonly speaker = new Speaker();
  private readonly signal: () => Signal;

  constructor(signal: () => Signal) {
    this.signal = signal;
  }

  /** Vor dem ersten Signal aus einer Nutzergeste aufrufen (Autoplay-Regeln der Browser). */
  prepare(): void {
    if (this.signal() === 'tone') this.tones.unlock();
  }

  cue(type: CueType): void {
    const signal = this.signal();
    if (signal === 'off') return;
    if (signal === 'voice') this.speaker.say(SPOKEN[type]);
    else this.tones.play(TONES[type]);
    vibrate(type === 'hold' ? [40, 80, 40] : 35);
  }

  silence(): void {
    this.speaker.cancel();
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    // Safari kennt die Vibration API nicht.
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // ignorieren
  }
}
