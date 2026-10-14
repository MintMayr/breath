/**
 * Hält den Bildschirm während einer Einheit an.
 *
 * `navigator.wakeLock.request()` ist asynchron. Wird `release()` aufgerufen,
 * während die Anfrage noch läuft, muss die später eintreffende Sperre sofort
 * wieder freigegeben werden – sonst bleibt der Bildschirm nach dem Beenden an.
 * Das regelt `wanted`.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private pending = false;
  private wanted = false;

  acquire(): void {
    this.wanted = true;
    if (this.sentinel || this.pending || !('wakeLock' in navigator)) return;
    this.pending = true;
    void navigator.wakeLock.request('screen').then(
      (sentinel) => {
        this.pending = false;
        if (!this.wanted) {
          void sentinel.release();
          return;
        }
        this.sentinel = sentinel;
        // Der Browser gibt die Sperre selbst frei, wenn der Tab verborgen wird.
        sentinel.addEventListener('release', () => {
          if (this.sentinel === sentinel) this.sentinel = null;
        });
      },
      () => {
        this.pending = false;
      },
    );
  }

  release(): void {
    this.wanted = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel) void sentinel.release().catch(() => undefined);
  }
}
