/** Holt ein Element per ID und prüft den Typ. Fehlt es, ist das ein Programmierfehler – laut scheitern. */
export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Element #${id} fehlt oder hat den falschen Typ`);
  return el;
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Erzeugt ein Element mit Klasse und optionalem Text (immer per `textContent`, nie als HTML). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
