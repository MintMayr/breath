import { formatDuration } from '../core/math';
import type { Suggestion } from '../core/progression';
import { co2Rests } from '../core/sequence';
import {
  CO2_BASES,
  CO2_BEST_PERCENT,
  SETTING_SPECS,
  SIGNALS,
  holdFromBest,
  isCo2Basis,
  isHoldFromBestCapped,
  isSignal,
  stepValue,
} from '../core/settings';
import type { NumericSettingKey } from '../core/settings';
import type { Co2Basis, Mode, Settings, Signal } from '../core/types';
import { el } from './dom';

export type SettingChange =
  | { readonly key: NumericSettingKey; readonly value: number }
  | { readonly key: 'co2Basis'; readonly value: Co2Basis }
  | { readonly key: 'signal'; readonly value: Signal };

const SIGNAL_LABELS: Readonly<Record<Signal, string>> = {
  tone: 'Ton',
  voice: 'Stimme',
  off: 'Aus',
};

const BASIS_LABELS: Readonly<Record<Co2Basis, string>> = {
  fixed: 'Fest',
  best: 'Nach Bestzeit',
};

interface RowDef {
  readonly key: NumericSettingKey;
  readonly label: string;
  /** Ausführlicher Name für Screenreader, z. B. „Ausatemzeit verringern“. */
  readonly a11yName: string;
  readonly show: (v: number) => string;
  /** Zeile nur zeigen, wenn die Bedingung zutrifft. */
  readonly when?: (s: Settings) => boolean;
}

const ROWS: Readonly<Record<Mode, readonly RowDef[]>> = {
  belly: [
    { key: 'bellyExhale', label: 'Ausatmen', a11yName: 'Ausatemzeit', show: (v) => `${v} s` },
    { key: 'bellyMinutes', label: 'Dauer', a11yName: 'Dauer', show: (v) => `${v} min` },
  ],
  lips: [
    { key: 'lipsExhale', label: 'Ausatmen', a11yName: 'Ausatemzeit', show: (v) => `${v} s` },
    { key: 'lipsMinutes', label: 'Dauer', a11yName: 'Dauer', show: (v) => `${v} min` },
  ],
  co2: [
    {
      key: 'co2Hold',
      label: 'Halten pro Runde',
      a11yName: 'Haltezeit',
      show: formatDuration,
      when: (s) => s.co2Basis === 'fixed',
    },
    {
      key: 'co2Best',
      label: 'Deine Bestzeit',
      a11yName: 'Bestzeit',
      show: formatDuration,
      when: (s) => s.co2Basis === 'best',
    },
    { key: 'co2Rounds', label: 'Runden', a11yName: 'Runden', show: String },
  ],
};

/**
 * Einstellungen der aktuellen Übung. Rendert per DOM-API (kein innerHTML),
 * meldet Änderungen per Callback und stellt danach den Fokus wieder her,
 * damit Tastatur- und Screenreader-Nutzer nicht an den Seitenanfang springen.
 */
export class SettingsPanel {
  private readonly root: HTMLElement;
  private readonly onChange: (change: SettingChange) => void;
  private locked = false;
  private settings: Settings | null = null;

  constructor(root: HTMLElement, onChange: (change: SettingChange) => void) {
    this.root = root;
    this.onChange = onChange;
    root.addEventListener('click', (e) => this.handleClick(e));
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.root.classList.toggle('is-locked', locked);
    this.root.inert = locked;
  }

  render(mode: Mode, settings: Settings, suggestion: Suggestion | null = null): void {
    this.settings = settings;
    const nodes: HTMLElement[] = [];
    if (suggestion) nodes.push(suggestBox(suggestion));
    if (mode === 'co2') {
      const options = CO2_BASES.map((b) => ({
        id: `co2Basis:${b}`,
        label: BASIS_LABELS[b],
        pressed: b === settings.co2Basis,
      }));
      nodes.push(row('Haltezeit', segmented('Haltezeit', options)));
    }
    const rows = ROWS[mode].filter((def) => def.when?.(settings) ?? true);
    for (const def of rows) {
      const spec = SETTING_SPECS[def.key];
      const value = settings[def.key];
      const control =
        spec.kind === 'choice'
          ? segmented(
              def.a11yName,
              spec.options.map((v) => ({
                id: `${def.key}:${v}`,
                label: def.show(v),
                pressed: v === value,
              })),
            )
          : stepper(def.key, def.a11yName, def.show(value));
      nodes.push(row(def.label, control));
    }

    if (mode === 'co2') nodes.push(co2Note(settings));
    nodes.push(
      row(
        'Signal',
        segmented(
          'Signal',
          SIGNALS.map((s) => ({
            id: `signal:${s}`,
            label: SIGNAL_LABELS[s],
            pressed: s === settings.signal,
          })),
        ),
      ),
    );
    this.root.replaceChildren(...nodes);
  }

  private handleClick(e: MouseEvent): void {
    if (this.locked || !this.settings || !(e.target instanceof Element)) return;
    const button = e.target.closest('button');
    const action = button?.dataset.action;
    if (!button || !action) return;

    const [key, arg] = action.split(':');
    const change = this.toChange(key ?? '', arg ?? '', this.settings);
    if (!change) return;
    this.onChange(change); // löst ein neues render() aus
    // Ein übernommener Vorschlag verschwindet; dann den Regler derselben Einstellung fokussieren.
    const target =
      this.root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`) ??
      this.root.querySelector<HTMLButtonElement>(`button[data-action^="${change.key}:"]`);
    target?.focus({ preventScroll: true });
  }

  private toChange(key: string, arg: string, s: Settings): SettingChange | null {
    if (key === 'signal') return isSignal(arg) ? { key, value: arg } : null;
    if (key === 'co2Basis') return isCo2Basis(arg) ? { key, value: arg } : null;
    if (!isNumericKey(key)) return null;
    if (arg === 'inc' || arg === 'dec')
      return { key, value: stepValue(key, s[key], arg === 'inc' ? 1 : -1) };
    return { key, value: Number(arg) };
  }
}

function isNumericKey(key: string): key is NumericSettingKey {
  return Object.hasOwn(SETTING_SPECS, key);
}

function row(label: string, control: HTMLElement): HTMLElement {
  const div = el('div', 'row');
  div.append(el('span', 'row-label', label), control);
  return div;
}

function segmented(
  groupLabel: string,
  options: readonly { id: string; label: string; pressed: boolean }[],
): HTMLElement {
  const group = el('div', 'seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', groupLabel);
  for (const o of options) {
    const b = button(o.label, o.id);
    b.setAttribute('aria-pressed', String(o.pressed));
    group.append(b);
  }
  return group;
}

function stepper(key: NumericSettingKey, a11yName: string, shown: string): HTMLElement {
  const wrap = el('div', 'stepper');
  const dec = button('−', `${key}:dec`);
  dec.setAttribute('aria-label', `${a11yName} verringern`);
  const inc = button('+', `${key}:inc`);
  inc.setAttribute('aria-label', `${a11yName} erhöhen`);
  const out = document.createElement('output');
  out.setAttribute('aria-live', 'polite');
  out.textContent = shown;
  wrap.append(dec, out, inc);
  return wrap;
}

/** Vorschlag aus dem Verlauf. Der Knopf löst eine ganz normale Einstellungsänderung aus. */
function suggestBox(suggestion: Suggestion): HTMLElement {
  const box = el('div', 'suggest');
  box.append(el('p', undefined, suggestion.text));
  if (suggestion.change) {
    const { key, value } = suggestion.change;
    box.append(button('Übernehmen', `${key}:${value}`));
  }
  return box;
}

function co2Note(s: Settings): HTMLElement {
  const rests = co2Rests(s.co2Rounds);
  const first = formatDuration(rests[0] ?? 0);
  const last = formatDuration(rests.at(-1) ?? 0);
  let fromBest = '';
  if (s.co2Basis === 'best') {
    const hold = formatDuration(holdFromBest(s.co2Best));
    fromBest = isHoldFromBestCapped(s.co2Best)
      ? `Gehalten werden ${CO2_BEST_PERCENT} % deiner Bestzeit, höchstens aber ${hold}. `
      : `Gehalten werden ${CO2_BEST_PERCENT} % deiner Bestzeit: ${hold}. `;
  }
  return el(
    'p',
    'note',
    fromBest +
      `Die Erholung zwischen den Runden sinkt von ${first} auf ${last}, die Haltezeit bleibt gleich. ` +
      'Erst steigern, wenn sich alle Runden locker anfühlen.',
  );
}

function button(label: string, action: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.action = action;
  b.textContent = label;
  return b;
}
