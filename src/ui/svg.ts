import { clamp } from '../core/math';

const NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export function svgText(
  text: string,
  attrs: Readonly<Record<string, string | number>>,
): SVGTextElement {
  const node = svgEl('text', attrs);
  node.textContent = text;
  return node;
}

/** Kleines Strich-Icon (24er-Raster) aus Pfaden, färbt sich mit `currentColor`. */
export function icon(paths: readonly string[], className = 'icon'): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: className, 'aria-hidden': 'true' });
  for (const d of paths) svg.append(svgEl('path', { d }));
  return svg;
}

export const FLAME = [
  'M12 3c.6 3.2-1.4 5-2.9 6.8C7.8 11.3 7 12.7 7 14.5a5 5 0 0 0 10 0c0-2-.9-3.6-2-4.8.1 1.6-.6 2.8-1.7 3.1.5-3.4-.1-7.2-1.3-9.8z',
];

/**
 * Zeiger, Tippen und Pfeiltasten wählen den nächstgelegenen Datenpunkt eines Diagramms.
 * `xs` sind die x-Positionen der Punkte in viewBox-Einheiten.
 */
export function attachScrubber(
  svg: SVGSVGElement,
  xs: readonly number[],
  onSelect: (index: number | null) => void,
): void {
  if (xs.length === 0) return;
  let current: number | null = null;
  const select = (i: number | null) => {
    if (i === current) return;
    current = i;
    onSelect(i);
  };
  const nearest = (clientX: number): number => {
    const box = svg.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(v - x) < Math.abs((xs[best] ?? 0) - x)) best = i;
    });
    return best;
  };

  svg.tabIndex = 0;
  svg.addEventListener('pointermove', (e) => select(nearest(e.clientX)));
  svg.addEventListener('pointerdown', (e) => select(nearest(e.clientX)));
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') select(null);
  });
  svg.addEventListener('blur', () => select(null));
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const from = current ?? (step > 0 ? -1 : xs.length);
    select(clamp(from + step, 0, xs.length - 1));
  });
}
