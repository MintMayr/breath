/** Deutsche Sprachansagen über die Web Speech API. */
export class Speaker {
  readonly supported: boolean;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    if (!this.supported) return;
    this.pickVoice();
    // Viele Browser liefern die Stimmenliste erst asynchron.
    speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
  }

  say(text: string): void {
    if (!this.supported) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = 0.95;
      if (this.voice) u.voice = this.voice;
      speechSynthesis.speak(u);
    } catch {
      // Sprachausgabe nicht verfügbar: still weitermachen.
    }
  }

  cancel(): void {
    if (!this.supported) return;
    try {
      speechSynthesis.cancel();
    } catch {
      // ignorieren
    }
  }

  private pickVoice(): void {
    try {
      const german = speechSynthesis.getVoices().filter((v) => /^de([-_]|$)/i.test(v.lang));
      // Stimmen auf dem Gerät bevorzugen: Online-Stimmen (z. B. „Google Deutsch“ in Chrome)
      // schicken jede Ansage an einen Server. Auf iPhone und iPad sind alle Stimmen lokal.
      this.voice = german.find((v) => v.localService) ?? german[0] ?? null;
    } catch {
      this.voice = null;
    }
  }
}
