import { MONTH_SHORT, dateKey, daysBetween, parseDateKey, shortDate } from '../core/dates';
import { FEEL_NAMES } from '../core/history';
import { clamp, formatDuration } from '../core/math';
import {
  co2Trend,
  describeRecord,
  exhaleTrend,
  groupByDay,
  heatmap,
  streak,
  totals,
  weekSummaries,
} from '../core/progress';
import type { Co2Point, HeatDay, Streak, Totals, TrendPoint, WeekSummary } from '../core/progress';
import type { History } from '../core/types';
import { el } from './dom';
import { FLAME, attachScrubber, icon, svgEl, svgText } from './svg';

/** Innenabstand plus Rahmen einer Karte (links + rechts), um die Diagrammbreite zu bestimmen. */
const CARD_INSET = 34;
const FALLBACK_WIDTH = 340;
const LEVELS = [0, 1, 2, 3] as const;
/** Pfeiltasten im Kalender: hoch/runter ein Tag, links/rechts eine Woche. */
const CALENDAR_KEYS: Readonly<Record<string, number>> = {
  ArrowUp: -1,
  ArrowDown: 1,
  ArrowLeft: -7,
  ArrowRight: 7,
};

/**
 * Die Seite „Verlauf“: Serie, Kalender, Wochen und Entwicklung. Alle Zahlen kommen aus
 * `core/progress.ts`; hier wird nur gezeichnet. Diagramme werden in echten Pixeln angelegt,
 * damit die Schrift nicht mitskaliert, deshalb neu rendern, wenn sich die Breite ändert.
 */
export class ProgressView {
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  render(history: History, today: Date): void {
    const width = Math.max(
      240,
      (this.root.clientWidth || FALLBACK_WIDTH + CARD_INSET) - CARD_INSET,
    );
    const calendar = calendarCard(history, today);
    this.root.replaceChildren(
      streakCard(streak(history, today), totals(history)),
      calendar.card,
      weeksCard(weekSummaries(history, today), width),
      trendsCard(history, today, width),
    );
    calendar.scrollToToday();
  }
}

// ---------- Serie ----------

function streakCard(s: Streak, t: Totals): HTMLElement {
  const node = card('Serie');
  const hero = el('div', 'hero');
  hero.append(
    icon(FLAME, s.todayDone ? 'flame is-lit' : 'flame'),
    el('span', 'hero-value', String(s.current)),
    el('span', 'hero-unit', s.current === 1 ? 'Tag in Folge' : 'Tage in Folge'),
  );
  const message = s.todayDone
    ? 'Heute erledigt.'
    : s.current > 0
      ? 'Heute noch offen – die Serie hält bis Mitternacht.'
      : 'Eine Übung heute startet eine neue Serie.';

  const stats = el('div', 'stats');
  stats.append(
    stat('Rekord', `${s.longest} ${s.longest === 1 ? 'Tag' : 'Tage'}`),
    stat('Trainingstage', String(t.days)),
    stat('Einheiten', String(t.sessions)),
    stat('Minuten', String(t.minutes)),
  );
  node.append(hero, el('p', 'sub', message), stats);
  if (t.sessions === 0) {
    node.append(
      el('p', 'note', 'Nach deiner ersten Einheit füllen sich hier Kalender und Entwicklung.'),
    );
  }
  return node;
}

function stat(label: string, value: string): HTMLElement {
  const node = el('div', 'stat');
  node.append(el('span', 'stat-label', label), el('span', 'stat-value', value));
  return node;
}

// ---------- Kalender ----------

function calendarCard(history: History, today: Date) {
  const weeks = heatmap(history, today);
  const byDay = groupByDay(history);
  const todayKey = dateKey(today);
  const node = card('Kalender', 'Ein Feld pro Tag. Je mehr verschiedene Übungen, desto grüner.');

  const grid = el('div', 'heat-grid');
  grid.setAttribute('aria-hidden', 'true');
  const cells = new Map<string, HTMLElement>();
  /** Vergangene Tage in Reihenfolge, für die Tastatur. */
  const days: HeatDay[] = [];

  weeks.forEach((week, w) => {
    const label = monthLabel(weeks, w);
    if (label) {
      const month = el('span', 'heat-month', label);
      month.style.gridColumn = String(w + 1);
      grid.append(month);
    }
    week.forEach((d, i) => {
      const cell = el('span');
      cell.dataset.level = String(d.level);
      cell.style.gridColumn = String(w + 1);
      cell.style.gridRow = String(i + 2);
      if (d.future) cell.className = 'is-future';
      else {
        cell.dataset.key = d.key;
        if (d.key === todayKey) cell.className = 'is-today';
        cells.set(d.key, cell);
        days.push(d);
      }
      grid.append(cell);
    });
  });

  const dayLabels = el('div', 'heat-days');
  dayLabels.setAttribute('aria-hidden', 'true');
  for (const text of ['', 'Mo', '', 'Mi', '', 'Fr', '', '']) dayLabels.append(el('span', '', text));

  const scroller = el('div', 'heat-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'group');
  scroller.setAttribute('aria-label', 'Kalender. Mit den Pfeiltasten einen Tag wählen.');
  scroller.append(grid);

  const activeDays = days.filter((d) => d.level > 0).length;
  const summary = `In den letzten 12 Monaten an ${activeDays} ${activeDays === 1 ? 'Tag' : 'Tagen'} trainiert.`;
  const readout = el('p', 'readout', summary);
  readout.setAttribute('aria-live', 'polite');

  let selected: string | null = null;
  const select = (key: string) => {
    if (selected) cells.get(selected)?.classList.remove('is-selected');
    selected = key;
    const cell = cells.get(key);
    cell?.classList.add('is-selected');
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const records = byDay.get(key) ?? [];
    const text = records.length > 0 ? records.map(describeRecord).join(' · ') : 'kein Training';
    readout.textContent = `${shortDate(parseDateKey(key))}: ${text}`;
  };
  const keyOf = (target: EventTarget | null) =>
    target instanceof HTMLElement ? target.dataset.key : undefined;

  grid.addEventListener('click', (e) => {
    const key = keyOf(e.target);
    if (key) select(key);
  });
  grid.addEventListener('pointerover', (e) => {
    const key = keyOf(e.target);
    if (key && e.pointerType === 'mouse') select(key);
  });
  scroller.addEventListener('keydown', (e) => {
    const step = CALENDAR_KEYS[e.key];
    const last = days.at(-1);
    if (step === undefined || !last) return;
    e.preventDefault();
    const index = days.findIndex((d) => d.key === selected);
    const next = index < 0 ? last : days[clamp(index + step, 0, days.length - 1)];
    if (next) select(next.key);
  });

  const heat = el('div', 'heat');
  heat.append(dayLabels, scroller);

  const legend = el('div', 'heat-legend');
  legend.setAttribute('aria-hidden', 'true');
  legend.append(el('span', '', 'weniger'));
  for (const level of LEVELS) {
    const swatch = el('span', 'swatch');
    swatch.dataset.level = String(level);
    legend.append(swatch);
  }
  legend.append(el('span', '', 'mehr'));

  node.append(heat, readout, legend);
  return {
    card: node,
    scrollToToday: () => {
      scroller.scrollLeft = scroller.scrollWidth;
    },
  };
}

/** Monatsname über der ersten Woche eines Monats; die erste Spalte nur, wenn Platz ist. */
function monthLabel(weeks: readonly (readonly HeatDay[])[], w: number): string | null {
  const month = weeks[w]?.[0]?.date.getMonth();
  if (month === undefined) return null;
  const name = MONTH_SHORT[month] ?? null;
  if (w > 0) return weeks[w - 1]?.[0]?.date.getMonth() === month ? null : name;
  const changesSoon = [1, 2].some((i) => weeks[i]?.[0]?.date.getMonth() !== month);
  return changesSoon ? null : name;
}

// ---------- Wochen ----------

function weeksCard(weeks: readonly WeekSummary[], width: number): HTMLElement {
  const current = weeks.at(-1);
  const node = card(
    'Wochen',
    current
      ? `Diese Woche ${current.plannedDone} von ${current.planned} geplanten Übungen erledigt.`
      : undefined,
  );
  node.append(el('h4', '', 'Minuten pro Woche'));

  const H = 150;
  const top = 20;
  const bottom = 22;
  const left = 30;
  const right = 6;
  const plotW = width - left - right;
  const plotH = H - top - bottom;
  const max = Math.max(0, ...weeks.map((w) => w.minutes));
  const step = niceStep(max);
  const yMax = Math.max(step, Math.ceil(max / step) * step);
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const band = plotW / weeks.length;
  const barW = Math.min(24, band - 6);

  const svg = chartSvg(width, H, `Minuten pro Woche in den letzten ${weeks.length} Wochen`);
  for (let v = 0; v <= yMax; v += step) {
    svg.append(svgEl('line', { x1: left, x2: width - right, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(svgText(String(v), { x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }));
  }

  const bars: SVGPathElement[] = [];
  const xs = weeks.map((w, i) => {
    const cx = left + band * (i + 0.5);
    const bar = svgEl('path', {
      d: columnPath(cx - barW / 2, y(w.minutes), barW, y(0)),
      class: 'bar',
    });
    bars.push(bar);
    svg.append(bar);
    if ((weeks.length - 1 - i) % 3 === 0) {
      const label =
        i === weeks.length - 1 ? 'jetzt' : `${w.start.getDate()}.${w.start.getMonth() + 1}.`;
      svg.append(svgText(label, { x: cx, y: H - 6, 'text-anchor': 'middle' }));
    }
    return cx;
  });
  // Direkt beschriftet wird nur die laufende Woche, den Rest tragen Achse, Antippen und Tabelle.
  const lastX = xs.at(-1);
  if (current && current.minutes > 0 && lastX !== undefined) {
    svg.append(
      svgText(String(current.minutes), {
        x: lastX,
        y: y(current.minutes) - 6,
        'text-anchor': 'middle',
        class: 'label',
      }),
    );
  }

  const hint = 'Tippe auf eine Woche für Details.';
  const readout = el('p', 'readout', hint);
  attachScrubber(svg, xs, (i) => {
    bars.forEach((b, j) => b.classList.toggle('is-active', j === i));
    const w = i === null ? undefined : weeks[i];
    readout.textContent = w
      ? `Woche ab ${shortDate(w.start)}: ${w.minutes} min, ${plural(w.sessions, 'Einheit', 'Einheiten')}, ` +
        `${w.plannedDone} von ${w.planned} geplant`
      : hint;
  });

  const rows = [...weeks]
    .reverse()
    .map((w) => [
      `ab ${shortDate(w.start)}`,
      String(w.minutes),
      String(w.sessions),
      `${w.plannedDone}/${w.planned}`,
    ]);
  node.append(svg, readout, tableView(['Woche', 'Minuten', 'Einheiten', 'Plan'], rows));
  return node;
}

/** Säule mit 4 px gerundetem Ende, eckig an der Grundlinie. Leer bei Höhe 0. */
function columnPath(x: number, yTop: number, w: number, base: number): string {
  const h = base - yTop;
  if (h < 0.5) return '';
  const r = Math.min(4, h, w / 2);
  return (
    `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} ` +
    `H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${base} Z`
  );
}

/** Runde Achsenschritte, sodass höchstens vier Gitterlinien über null entstehen. */
function niceStep(max: number): number {
  const steps = [5, 10, 15, 30, 60, 90, 120, 180, 240, 300, 600];
  return steps.find((s) => max / s <= 4) ?? Math.ceil(max / 4);
}

// ---------- Entwicklung ----------

interface Series {
  readonly title: string;
  readonly short: string;
  readonly points: readonly (TrendPoint | Co2Point)[];
  readonly fmt: (v: number) => string;
}

function trendsCard(history: History, today: Date, width: number): HTMLElement {
  const node = card('Entwicklung', 'So haben sich Ausatem- und Haltezeit verändert.');
  const seconds = (v: number) => `${v} s`;
  const series: readonly Series[] = [
    {
      title: 'Zwerchfellatmung · Ausatmen',
      short: 'Zwerchfell',
      points: exhaleTrend(history, 'belly', today),
      fmt: seconds,
    },
    {
      title: 'Lippenbremse · Ausatmen',
      short: 'Lippenbremse',
      points: exhaleTrend(history, 'lips', today),
      fmt: seconds,
    },
    {
      title: 'CO₂-Tabelle · Haltezeit',
      short: 'CO₂',
      points: co2Trend(history, today),
      fmt: formatDuration,
    },
  ];

  // Gemeinsame Zeitachse für alle drei, damit die Kurven untereinander vergleichbar sind.
  const start = series.flatMap((s) => s.points.map((p) => p.day)).sort()[0];
  if (start === undefined) {
    node.append(
      el(
        'p',
        'note',
        'Noch keine Einheiten mit Details. Nach dem nächsten Training geht es hier los.',
      ),
    );
    return node;
  }
  const span = Math.max(1, daysBetween(parseDateKey(start), today));
  for (const s of series) node.append(trendBlock(s, start, span, width));

  const rows: string[][] = [];
  for (const s of series) {
    let previous: number | null = null;
    for (const p of s.points) {
      if (p.value !== previous)
        rows.push([shortDate(parseDateKey(p.day)), s.short, s.fmt(p.value)]);
      previous = p.value;
    }
  }
  node.append(tableView(['Seit', 'Übung', 'Wert'], rows, 2));
  return node;
}

function trendBlock(s: Series, start: string, span: number, width: number): HTMLElement {
  const block = el('div', 'trend');
  block.append(el('h4', '', s.title));
  const first = s.points[0];
  const last = s.points.at(-1);
  if (!first || !last) {
    block.append(el('p', 'sub', 'Noch keine Einheiten.'));
    return block;
  }

  const change =
    first.value === last.value
      ? `gleichbleibend ${s.fmt(last.value)}`
      : `von ${s.fmt(first.value)} auf ${s.fmt(last.value)}`;
  const best = 'best' in last && last.best ? ` · Bestzeit ${formatDuration(last.best)}` : '';
  const summary = `${change} · ${plural(s.points.length, 'Einheit', 'Einheiten')}${best}`;
  block.append(el('p', 'sub', summary));

  const latest = `Zuletzt ${shortDate(parseDateKey(last.day))}: ${pointText(last, s.fmt)}`;
  const readout = el('p', 'readout', latest);
  const chart = stepChart(s, start, span, width, `${s.title}: ${summary}`, (p) => {
    readout.textContent = p ? `${shortDate(parseDateKey(p.day))}: ${pointText(p, s.fmt)}` : latest;
  });
  block.append(chart, readout);
  return block;
}

function pointText(p: TrendPoint | Co2Point, fmt: (v: number) => string): string {
  const parts = [fmt(p.value)];
  if ('fullHolds' in p) parts.push(`${p.fullHolds} von ${p.rounds} voll gehalten`);
  if (p.feel) parts.push(FEEL_NAMES[p.feel]);
  return parts.join(', ');
}

/** Stufenlinie: Eine Einstellung gilt, bis sie sich ändert. Endpunkt mit Wert beschriftet. */
function stepChart(
  s: Series,
  start: string,
  span: number,
  width: number,
  label: string,
  onSelect: (p: TrendPoint | Co2Point | null) => void,
): SVGSVGElement {
  const H = 100;
  const top = 10;
  const bottom = 20;
  const left = 40;
  const right = 44;
  const plotW = width - left - right;
  const plotH = H - top - bottom;
  const values = s.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.25, 1);
  const x = (day: string) =>
    left + (daysBetween(parseDateKey(start), parseDateKey(day)) / span) * plotW;
  const y = (v: number) => top + (1 - (v - min + pad) / (max - min + 2 * pad)) * plotH;

  const svg = chartSvg(width, H, label);
  for (const v of new Set([min, max])) {
    svg.append(svgEl('line', { x1: left, x2: width - right, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(svgText(s.fmt(v), { x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }));
  }
  const startDate = parseDateKey(start);
  svg.append(
    svgText(`${startDate.getDate()}. ${MONTH_SHORT[startDate.getMonth()] ?? ''}`, {
      x: left,
      y: H - 4,
    }),
    svgText('heute', { x: width - right, y: H - 4, 'text-anchor': 'end' }),
  );

  const xs = s.points.map((p) => x(p.day));
  const d = s.points
    .map((p, i) => (i === 0 ? `M${xs[0]},${y(p.value)}` : `H${xs[i]} V${y(p.value)}`))
    .join(' ');
  svg.append(svgEl('path', { d, class: 'line' }));

  const last = s.points.at(-1);
  const lastX = xs.at(-1);
  if (last && lastX !== undefined) {
    svg.append(
      svgEl('circle', { cx: lastX, cy: y(last.value), r: 4, class: 'dot' }),
      svgText(s.fmt(last.value), { x: lastX + 8, y: y(last.value) + 4, class: 'label' }),
    );
  }

  const cross = svgEl('line', { y1: top, y2: H - bottom, class: 'cross', visibility: 'hidden' });
  const focus = svgEl('circle', { r: 4, class: 'dot', visibility: 'hidden' });
  svg.append(cross, focus);
  attachScrubber(svg, xs, (i) => {
    const p = i === null ? undefined : s.points[i];
    const px = i === null ? undefined : xs[i];
    const visible = p && px !== undefined ? 'visible' : 'hidden';
    cross.setAttribute('visibility', visible);
    focus.setAttribute('visibility', visible);
    if (p && px !== undefined) {
      cross.setAttribute('x1', String(px));
      cross.setAttribute('x2', String(px));
      focus.setAttribute('cx', String(px));
      focus.setAttribute('cy', String(y(p.value)));
    }
    onSelect(p ?? null);
  });
  return svg;
}

// ---------- Bausteine ----------

function card(title: string, sub?: string): HTMLElement {
  const node = el('section', 'card');
  node.append(el('h3', '', title));
  if (sub) node.append(el('p', 'sub', sub));
  return node;
}

/** Diagramm-Fläche; das transparente Rechteck fängt Zeiger auch zwischen den Marken. */
function chartSvg(width: number, height: number, label: string): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'chart',
    role: 'img',
    'aria-label': label,
  });
  svg.append(svgEl('rect', { width, height, fill: 'transparent' }));
  return svg;
}

/** Tabellen-Ansicht zum Diagramm, damit kein Wert nur über Antippen erreichbar ist. */
function tableView(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  firstNumeric = 1,
): HTMLElement {
  const details = el('details', 'table-view');
  details.append(el('summary', '', 'Als Tabelle'));
  const table = el('table');
  const head = el('tr');
  headers.forEach((h, i) => {
    const th = el('th', i >= firstNumeric ? 'num' : '', h);
    th.scope = 'col';
    head.append(th);
  });
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    row.forEach((cell, i) => tr.append(el('td', i >= firstNumeric ? 'num' : '', cell)));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  details.append(table);
  return details;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
