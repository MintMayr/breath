/** Größer wird eine echte Sicherung nie; schützt vor versehentlich gewählten Riesendateien. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type PickResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unreadable' };

/** Bietet Text als Datei zum Speichern an. `false`, wenn der Browser das nicht kann. */
export function downloadText(name: string, text: string, type = 'application/json'): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    // Erst später freigeben, manche Browser lesen die URL nach dem Klick asynchron.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Öffnet den Dateidialog und liest die gewählte Datei als Text. */
export function pickTextFile(accept = 'application/json,.json'): Promise<PickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('cancel', () => resolve({ ok: false, reason: 'cancelled' }));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve({ ok: false, reason: 'cancelled' });
      if (file.size > MAX_IMPORT_BYTES) return resolve({ ok: false, reason: 'unreadable' });
      file.text().then(
        (text) => resolve({ ok: true, text }),
        () => resolve({ ok: false, reason: 'unreadable' }),
      );
    });
    try {
      input.click();
    } catch {
      resolve({ ok: false, reason: 'unreadable' });
    }
  });
}
