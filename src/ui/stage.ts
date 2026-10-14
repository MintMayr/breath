import type { PhaseType } from '../core/types';

export type StagePhase = PhaseType | 'ready' | 'paused' | 'done';

/** Wasserstand (0–1), auf den eine Phase hinführt. `null`: Stand halten. */
export const WATER_TARGET: Readonly<Record<PhaseType, number | null>> = {
  in: 0.86,
  out: 0.14,
  hold: null,
  rest: 0.42,
  settle: 0.42,
};
export const WATER_IDLE = 0.42;

const MAX_BUBBLES = 40;

/** Die Wassersäule: Stand, Phasen-Attribut fürs CSS und aufsteigende Blasen. */
export class Stage {
  private readonly stage: HTMLElement;
  private readonly water: HTMLElement;
  private readonly bubbles: HTMLElement;

  constructor(stage: HTMLElement, water: HTMLElement, bubbles: HTMLElement) {
    this.stage = stage;
    this.water = water;
    this.bubbles = bubbles;
  }

  setPhase(phase: StagePhase): void {
    this.stage.dataset.phase = phase;
  }

  setLevel(level: number): void {
    this.water.style.height = `${(level * 100).toFixed(2)}%`;
  }

  bubble(): void {
    if (this.bubbles.childElementCount > MAX_BUBBLES) return;
    const b = document.createElement('i');
    const size = 4 + Math.random() * 10;
    b.style.width = b.style.height = `${size.toFixed(1)}px`;
    b.style.left = `${(30 + Math.random() * 40).toFixed(1)}%`;
    b.style.setProperty('--drift', `${(Math.random() * 30 - 15).toFixed(1)}px`);
    b.style.animationDuration = `${(2.2 + Math.random() * 1.6).toFixed(2)}s`;
    b.addEventListener('animationend', () => b.remove());
    this.bubbles.append(b);
  }
}
