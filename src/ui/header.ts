import { DAY_LONG, DAY_SHORT, dateKey, weekDays, weekdayIndex } from '../core/dates';
import { MODE_NAMES, dayPlanText, plannedModes } from '../core/plan';
import { doneOn } from '../core/history';
import type { Streak } from '../core/progress';
import type { History } from '../core/types';
import { FLAME, icon } from './svg';

export function renderToday(el: HTMLElement, today: Date): void {
  el.textContent = dayPlanText(today);
}

/** Serien-Chip neben dem Titel: Flamme leuchtet, sobald heute trainiert wurde. */
export function renderStreakChip(el: HTMLButtonElement, s: Streak): void {
  el.replaceChildren(
    icon(FLAME, s.todayDone ? 'flame is-lit' : 'flame'),
    document.createTextNode(String(s.current)),
  );
  const days = `${s.current} ${s.current === 1 ? 'Tag' : 'Tage'} in Folge`;
  el.setAttribute(
    'aria-label',
    `Serie: ${days}, heute ${s.todayDone ? 'erledigt' : 'noch offen'}. Verlauf öffnen`,
  );
}

/** Wochenleiste: pro Tag ein Punkt je geplanter Übung, gefüllt wenn erledigt. */
export function renderWeek(el: HTMLElement, today: Date, history: History): void {
  const todayIdx = weekdayIndex(today);
  const items = weekDays(today).map((day, i) => {
    const done = doneOn(history, dateKey(day));
    const planned = plannedModes(day);

    const li = document.createElement('li');
    if (i === todayIdx) {
      li.className = 'is-today';
      li.setAttribute('aria-current', 'date');
    }

    const label = document.createElement('span');
    label.setAttribute('aria-hidden', 'true');
    label.textContent = DAY_SHORT[i] ?? '';

    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    for (const mode of planned) {
      const dot = document.createElement('span');
      dot.className = done.includes(mode) ? 'dot done' : 'dot';
      dots.append(dot);
    }

    const sr = document.createElement('span');
    sr.className = 'sr';
    const states = planned.map(
      (m) => `${MODE_NAMES[m]} ${done.includes(m) ? 'erledigt' : 'offen'}`,
    );
    sr.textContent = `${DAY_LONG[i] ?? ''}: ${states.join(', ')}`;

    li.append(label, dots, sr);
    return li;
  });
  el.replaceChildren(...items);
}
