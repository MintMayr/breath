/** Kurze Sinustöne über die Web Audio API. */

type Note = readonly [frequencyHz: number, offsetSeconds: number];

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export class TonePlayer {
  private ctx: AudioContext | null = null;

  /**
   * Erzeugt bzw. weckt den AudioContext. Muss innerhalb einer Nutzergeste
   * (Klick) aufgerufen werden, sonst bleibt er in Safari/Chrome stumm.
   */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (Ctor) this.ctx = new Ctor();
      }
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(notes: readonly Note[], length = 0.18): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      for (const [freq, offset] of notes) {
        const t = ctx.currentTime + offset;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + length + 0.03);
      }
    } catch {
      // Audio ist Komfort, kein Muss: Fehler nicht bis in die UI durchreichen.
    }
  }
}
