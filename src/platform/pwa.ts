import { registerSW } from 'virtual:pwa-register';

/**
 * Registriert den Service Worker, damit die App offline läuft. Eine neue Version wird nie
 * von selbst geladen, denn das würde eine laufende Einheit abbrechen: `onUpdate` meldet sie,
 * die zurückgegebene Funktion aktiviert sie und lädt neu. Ohne Service Worker passiert nichts.
 */
export function registerOffline(onUpdate: () => void): () => void {
  try {
    if (!('serviceWorker' in navigator)) return () => {};
    const update = registerSW({ onNeedRefresh: onUpdate });
    return () => void update(true);
  } catch {
    return () => {};
  }
}
