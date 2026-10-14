import { dateKey } from '../core/dates';
import { easeInOut, formatDuration } from '../core/math';
import { MODE_NAMES, nextPlannedMode, suggestedMode } from '../core/plan';
import { buildSequence, inhaleSeconds, totalSeconds } from '../core/sequence';
import { Session } from '../core/session';
import { addRecord, createRecord, doneOn, setFeel } from '../core/history';
import { suggestion } from '../core/progression';
import { CO2_BEST_PERCENT, co2HoldFor, normalizeValue } from '../core/settings';
import { mergeData, parseImport, serializeStoredData } from '../core/stored-data';
import type { StoredData } from '../core/stored-data';
import { isFeel, isMode } from '../core/types';
import type { Feel, Mode, PhaseType, Settings } from '../core/types';
import { Cues } from '../platform/cues';
import { downloadText, pickTextFile } from '../platform/files';
import { registerOffline } from '../platform/pwa';
import { loadData, saveData } from '../platform/storage';
import { ScreenWakeLock } from '../platform/wake-lock';
import { streak } from '../core/progress';
import { byId, setText } from './dom';
import { renderStreakChip, renderToday, renderWeek } from './header';
import { openInfo } from './info-view';
import { ProgressView } from './progress-view';
import { SettingsPanel } from './settings-panel';
import type { SettingChange } from './settings-panel';
import { Stage, WATER_IDLE, WATER_TARGET } from './stage';

const PHASE_LABEL: Readonly<Record<PhaseType, string>> = {
  in: 'Einatmen',
  out: 'Ausatmen',
  hold: 'Luft anhalten',
  rest: 'Erholen',
  settle: 'Ausklingen',
};

const SAFETY_CO2 =
  'Nur an Land, im Sitzen oder Liegen, nie im oder am Wasser. ' +
  'Bei Schwindel, Kribbeln oder Flimmern sofort normal weiteratmen und aufhören.';
const SAFETY_DEFAULT = 'Bei Schwindel kurz unterbrechen und normal weiteratmen.';

const BUBBLE_INTERVAL_MS = 150;
/** Erholungsphasen gleiten langsamer auf ihren Wasserstand als Atemphasen. */
const CALM_RAMP_MS = 2500;
/** Wie oft geprüft wird, ob ein neuer Kalendertag begonnen hat. */
const DAY_CHECK_MS = 60_000;

type View = 'ready' | 'running' | 'paused' | 'done';

const TABS = ['training', 'progress', 'info'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: unknown): value is Tab {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

function queryElements() {
  return {
    streak: byId('streak', HTMLButtonElement),
    update: byId('update', HTMLElement),
    reload: byId('reload', HTMLButtonElement),
    tabs: byId('tabs', HTMLElement),
    views: {
      training: byId('viewTraining', HTMLElement),
      progress: byId('viewProgress', HTMLElement),
      info: byId('viewInfo', HTMLElement),
    } satisfies Record<Tab, HTMLElement>,
    progress: byId('progress', HTMLElement),
    exportData: byId('exportData', HTMLButtonElement),
    importData: byId('importData', HTMLButtonElement),
    dataStatus: byId('dataStatus', HTMLElement),
    today: byId('today', HTMLElement),
    week: byId('week', HTMLOListElement),
    modes: byId('modes', HTMLElement),
    stage: byId('stage', HTMLElement),
    water: byId('water', HTMLElement),
    bubbles: byId('bubbles', HTMLElement),
    phase: byId('phase', HTMLElement),
    count: byId('count', HTMLElement),
    hint: byId('hint', HTMLElement),
    why: byId('why', HTMLButtonElement),
    feel: byId('feel', HTMLElement),
    bar: byId('bar', HTMLElement),
    progressText: byId('progressText', HTMLElement),
    main: byId('main', HTMLButtonElement),
    stop: byId('stop', HTMLButtonElement),
    settings: byId('settings', HTMLElement),
    safety: byId('safety', HTMLElement),
  };
}

/**
 * Verdrahtet Logik (core/), Browser-APIs (platform/) und DOM.
 * Der Zustand ist bewusst klein: `session` ist gesetzt, solange eine Einheit
 * läuft oder pausiert ist; `finished` nur auf dem „Geschafft“-Bildschirm.
 */
export class App {
  private readonly els = queryElements();
  private readonly stage = new Stage(this.els.stage, this.els.water, this.els.bubbles);
  private readonly panel = new SettingsPanel(this.els.settings, (c) => this.changeSetting(c));
  private readonly cues = new Cues(() => this.data.settings.signal);
  private readonly wakeLock = new ScreenWakeLock();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly progressView = new ProgressView(this.els.progress);

  private data: StoredData = loadData();
  private tab: Tab = 'training';
  /** Eine neue Version liegt bereit; `applyUpdate` aktiviert sie (nur außerhalb einer Einheit). */
  private updateReady = false;
  private applyUpdate: () => void = () => {};
  private today = new Date();
  private mode: Mode = suggestedMode(doneOn(this.data.history, dateKey(this.today)), this.today);

  private session: Session | null = null;
  /** Beginn der laufenden Einheit. Sie wird an diesem Tag eingetragen, auch wenn sie über Mitternacht geht. */
  private sessionDay = new Date();
  /** Gesetzt auf dem „Geschafft“-Bildschirm. `at` identifiziert den gerade gespeicherten Eintrag. */
  private finished: { readonly next: Mode | null; readonly at: number } | null = null;

  private raf = 0;
  private level = WATER_IDLE;
  private fromLevel = WATER_IDLE;
  private shownIndex = -1;
  private lastBubble = 0;

  init(): void {
    this.els.main.addEventListener('click', () => this.onMain());
    this.els.stop.addEventListener('click', () => this.stop());
    this.els.modes.addEventListener('click', (e) => {
      if (this.session || !(e.target instanceof Element)) return;
      const mode = e.target.closest('button')?.dataset.mode;
      if (isMode(mode)) this.selectMode(mode);
    });
    this.els.feel.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const feel = e.target.closest('button')?.dataset.feel;
      if (isFeel(feel)) this.rate(feel);
    });
    this.els.tabs.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const tab = e.target.closest('button')?.dataset.tab;
      if (isTab(tab)) this.showTab(tab);
    });
    this.els.streak.addEventListener('click', () => this.showTab('progress'));
    this.applyUpdate = registerOffline(() => {
      this.updateReady = true;
      this.renderUpdate();
    });
    this.els.reload.addEventListener('click', () => {
      if (!this.session) this.applyUpdate();
    });
    this.els.exportData.addEventListener('click', () => this.exportData());
    this.els.importData.addEventListener('click', () => void this.importData());
    this.els.why.addEventListener('click', () => {
      this.showTab('info');
      openInfo(this.mode);
    });
    // Diagramme sind in Pixeln gezeichnet: bei neuer Breite neu zeichnen.
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (this.tab === 'progress') this.renderProgress();
      });
    });

    // Im Hintergrund laufen weder Animation noch Signale zuverlässig. Statt still
    // weiterzuzählen (und ein „Jetzt atmen“ zu verschlucken), wird pausiert.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (this.view === 'running') this.pause();
      } else {
        this.refreshDay();
      }
    });
    window.setInterval(() => this.refreshDay(), DAY_CHECK_MS);

    this.renderHeader();
    this.selectMode(this.mode);
  }

  private get view(): View {
    if (this.session) return this.session.status === 'paused' ? 'paused' : 'running';
    return this.finished ? 'done' : 'ready';
  }

  // ---------- Ablauf ----------

  private onMain(): void {
    switch (this.view) {
      case 'ready':
        this.start();
        break;
      case 'running':
        if (this.session?.current.type === 'hold') this.skipHold();
        else this.pause();
        break;
      case 'paused':
        this.resume();
        break;
      case 'done': {
        const next = this.finished?.next;
        if (next) this.selectMode(next);
        else this.showReady();
        break;
      }
    }
  }

  private start(): void {
    this.cues.prepare(); // muss in der Klick-Geste passieren
    this.sessionDay = new Date();
    this.session = new Session(buildSequence(this.mode, this.data.settings), performance.now());
    this.finished = null;
    this.shownIndex = -1;
    this.lock(true);
    this.els.feel.hidden = true;
    this.els.why.hidden = true;
    this.els.stop.hidden = false;
    this.els.count.classList.remove('is-time');
    this.afterPhaseChange(this.session);
    this.wakeLock.acquire();
    this.loop();
  }

  private skipHold(): void {
    const s = this.session;
    if (!s) return;
    s.skip(performance.now());
    this.afterPhaseChange(s);
  }

  private pause(): void {
    const s = this.session;
    if (!s || s.status !== 'running') return;
    s.pause(performance.now());
    cancelAnimationFrame(this.raf);
    this.stage.setPhase('paused');
    this.els.phase.textContent = 'Pausiert';
    this.setMain('Weiter');
    this.wakeLock.release();
    this.cues.silence();
  }

  private resume(): void {
    const s = this.session;
    if (!s || s.status !== 'paused') return;
    s.resume(performance.now());
    this.afterPhaseChange(s);
    if (this.session) {
      this.wakeLock.acquire();
      this.loop();
    }
  }

  private stop(): void {
    this.session = null;
    this.cues.silence();
    this.wakeLock.release();
    this.showReady();
  }

  /** Nach einem Phasenwechsel: Anzeige aktualisieren und Signal geben – oder abschließen. */
  private afterPhaseChange(s: Session): void {
    if (s.status === 'done') {
      this.finish(s);
      return;
    }
    this.showPhase();
    this.render(performance.now()); // sofort, nicht erst im nächsten Frame
    this.cues.cue(s.current.type);
  }

  private finish(s: Session): void {
    cancelAnimationFrame(this.raf);
    this.wakeLock.release();
    this.session = null;

    const key = dateKey(this.sessionDay);
    const at = this.sessionDay.getTime();
    const record = createRecord(this.mode, this.data.settings, key, at, s.cutHolds);
    this.data = { ...this.data, history: addRecord(this.data.history, record) };
    saveData(this.data);
    this.today = new Date();
    this.renderHeader();

    const next = nextPlannedMode(doneOn(this.data.history, key), this.sessionDay);
    this.finished = { next, at };
    this.stage.setPhase('done');
    this.els.phase.textContent = 'Geschafft';
    this.els.count.textContent = '✓';
    this.els.hint.textContent =
      `${MODE_NAMES[this.mode]} für heute erledigt.` +
      (next ? ` Als Nächstes: ${MODE_NAMES[next]}.` : ' Bis morgen.');
    this.els.bar.style.width = '100%';
    this.els.progressText.textContent = 'fertig';
    this.setMain(next ? `Weiter mit ${MODE_NAMES[next]}` : 'Zurück zum Start');
    this.els.stop.hidden = true;
    this.markFeel(null);
    this.els.feel.hidden = false;
    this.els.why.hidden = true;
    this.lock(false);
    this.renderPanel();
    this.resetWater();
    this.cues.cue('done');
  }

  /** Bewertung der gerade beendeten Einheit; lässt sich bis zum Verlassen des Bildschirms ändern. */
  private rate(feel: Feel): void {
    const f = this.finished;
    if (!f) return;
    this.data = { ...this.data, history: setFeel(this.data.history, f.at, feel) };
    saveData(this.data);
    this.markFeel(feel);
    this.renderPanel();
  }

  private markFeel(feel: Feel | null): void {
    for (const b of this.els.feel.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.feel === feel));
    }
  }

  // ---------- Darstellung ----------

  private loop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (): void => {
    const s = this.session;
    if (!s || s.status !== 'running') return;
    const now = performance.now();
    if (s.advance(now)) {
      this.afterPhaseChange(s);
      if (!this.session) return;
    } else {
      this.render(now);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private showPhase(): void {
    const s = this.session;
    if (!s) return;
    const p = s.current;
    if (s.index !== this.shownIndex) {
      this.fromLevel = this.level;
      this.shownIndex = s.index;
    }
    this.stage.setPhase(p.type);
    this.els.phase.textContent = PHASE_LABEL[p.type];
    this.els.hint.textContent = p.hint;
    this.setMain(p.type === 'hold' ? 'Jetzt atmen' : 'Pause', p.type === 'hold');
  }

  private render(now: number): void {
    const s = this.session;
    if (!s) return;
    const snap = s.snapshot(now);
    const p = snap.phase;
    const motion = !this.reducedMotion.matches;

    const target = WATER_TARGET[p.type];
    if (target !== null) {
      const calm = p.type === 'rest' || p.type === 'settle';
      const k = calm ? Math.min(1, snap.elapsedMs / CALM_RAMP_MS) : snap.phaseProgress;
      this.level = this.fromLevel + (target - this.fromLevel) * easeInOut(k);
      if (calm && motion) this.level += Math.sin(now / 1100) * 0.012 * k;
    }
    this.stage.setLevel(this.level);

    setText(this.els.count, String(snap.secondsLeft));
    this.els.bar.style.width = `${((snap.doneSeconds / snap.totalSeconds) * 100).toFixed(2)}%`;
    setText(
      this.els.progressText,
      this.mode === 'co2'
        ? `Runde ${p.round ?? 1} von ${this.data.settings.co2Rounds}`
        : `noch ${formatDuration(Math.ceil(snap.totalSeconds - snap.doneSeconds))}`,
    );

    if (p.type === 'out' && motion && now - this.lastBubble > BUBBLE_INTERVAL_MS) {
      this.lastBubble = now;
      this.stage.bubble();
    }
  }

  private showReady(): void {
    cancelAnimationFrame(this.raf);
    this.finished = null;
    const s = this.data.settings;
    const seq = buildSequence(this.mode, s);
    this.stage.setPhase('ready');
    this.els.phase.textContent = MODE_NAMES[this.mode];
    this.els.count.textContent = formatDuration(totalSeconds(seq));
    this.els.count.classList.add('is-time');
    this.els.hint.textContent = readyHint(this.mode, s);
    this.els.bar.style.width = '0%';
    this.els.progressText.textContent =
      this.mode === 'co2' ? `${s.co2Rounds} Runden` : `${seq.length / 2} Atemzüge`;
    this.setMain('Start');
    this.els.stop.hidden = true;
    this.els.feel.hidden = true;
    this.els.why.hidden = false;
    this.lock(false);
    this.resetWater();
  }

  private selectMode(mode: Mode): void {
    this.mode = mode;
    for (const b of this.els.modes.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    }
    this.renderPanel();
    this.els.safety.textContent = mode === 'co2' ? SAFETY_CO2 : SAFETY_DEFAULT;
    this.showReady();
  }

  private changeSetting(change: SettingChange): void {
    if (this.session) return;
    this.data = { ...this.data, settings: applyChange(this.data.settings, change) };
    saveData(this.data);
    this.renderPanel();
    this.showReady();
  }

  private renderPanel(): void {
    const { history, settings } = this.data;
    const hint = suggestion(history, this.mode, settings, this.today);
    this.panel.render(this.mode, settings, hint);
  }

  private renderHeader(): void {
    renderToday(this.els.today, this.today);
    renderWeek(this.els.week, this.today, this.data.history);
    renderStreakChip(this.els.streak, streak(this.data.history, this.today));
  }

  /**
   * Wechselt den Bereich. Während einer Einheit gesperrt: Die Wassersäule und
   * „Jetzt atmen“ dürfen nie aus dem Blick geraten.
   */
  private showTab(tab: Tab): void {
    if (this.session) return;
    this.tab = tab;
    for (const t of TABS) this.els.views[t].hidden = t !== tab;
    for (const b of this.els.tabs.querySelectorAll('button')) {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (tab === 'progress') this.renderProgress();
    window.scrollTo({ top: 0 });
  }

  private renderProgress(): void {
    this.progressView.render(this.data.history, this.today);
  }

  // ---------- Daten sichern/laden ----------

  private exportData(): void {
    const name = `atemtrainer-${dateKey(new Date())}.json`;
    const ok = downloadText(name, serializeStoredData(this.data));
    this.els.dataStatus.textContent = ok
      ? `Gesichert als ${name}.`
      : 'Dieser Browser kann keine Dateien speichern.';
  }

  private async importData(): Promise<void> {
    const picked = await pickTextFile();
    if (!picked.ok) {
      if (picked.reason === 'unreadable') {
        this.els.dataStatus.textContent = 'Die Datei ließ sich nicht lesen.';
      }
      return;
    }
    const imported = parseImport(picked.text);
    if (!imported) {
      this.els.dataStatus.textContent = 'Das ist keine Sicherung des Atemtrainers.';
      return;
    }
    const sessions = imported.history.length;
    const question =
      `Die Datei enthält ${sessions === 1 ? 'eine Einheit' : `${sessions} Einheiten`}. ` +
      'Mit deinem Verlauf zusammenführen und die Einstellungen aus der Datei übernehmen?';
    // Während der Dateiauswahl könnte eine Einheit gestartet worden sein.
    if (this.session || !window.confirm(question)) return;

    const before = this.data.history.length;
    this.data = mergeData(this.data, imported);
    saveData(this.data);
    const added = Math.max(0, this.data.history.length - before);
    this.els.dataStatus.textContent =
      `${added === 1 ? 'Eine neue Einheit' : `${added} neue Einheiten`} übernommen, ` +
      'Einstellungen aktualisiert.';
    this.renderHeader();
    this.renderProgress();
    this.selectMode(this.mode);
  }

  /** Neuer Kalendertag (App über Nacht offen)? Dann Kopf und Vorschlag aktualisieren. */
  private refreshDay(): void {
    const now = new Date();
    const changed = dateKey(now) !== dateKey(this.today);
    this.today = now;
    if (!changed) return;
    this.renderHeader();
    if (this.tab === 'progress') this.renderProgress();
    if (this.view === 'ready') {
      this.selectMode(suggestedMode(doneOn(this.data.history, dateKey(now)), now));
    }
  }

  /** Sperrt während einer Einheit alles, was vom Training wegführt oder es verändert. */
  private lock(on: boolean): void {
    this.panel.setLocked(on);
    for (const b of this.els.modes.querySelectorAll('button')) b.disabled = on;
    this.els.tabs.hidden = on;
    this.els.streak.disabled = on;
    this.renderUpdate();
  }

  /** Neu laden würde eine laufende Einheit abbrechen, deshalb dann kein Hinweis. */
  private renderUpdate(): void {
    this.els.update.hidden = !this.updateReady || this.session !== null;
  }

  private setMain(text: string, signal = false): void {
    this.els.main.textContent = text;
    this.els.main.classList.toggle('is-signal', signal);
  }

  private resetWater(): void {
    this.level = WATER_IDLE;
    this.stage.setLevel(this.level);
  }
}

function applyChange(s: Settings, change: SettingChange): Settings {
  if (change.key === 'signal') return { ...s, signal: change.value };
  if (change.key === 'co2Basis') return { ...s, co2Basis: change.value };
  return { ...s, [change.key]: normalizeValue(change.key, change.value) };
}

function readyHint(mode: Mode, s: Settings): string {
  switch (mode) {
    case 'belly':
      return `Aufrecht hinsetzen, eine Hand auf den Bauch. ${inhaleSeconds('belly')} s ein, ${s.bellyExhale} s aus.`;
    case 'lips':
      return `${inhaleSeconds('lips')} s durch die Nase ein, ${s.lipsExhale} s gegen die Lippen aus.`;
    case 'co2': {
      const basis = s.co2Basis === 'best' ? ` (${CO2_BEST_PERCENT} % deiner Bestzeit)` : '';
      return `${s.co2Rounds} Runden mit je ${formatDuration(co2HoldFor(s))} Luft anhalten${basis}, die Pausen werden kürzer.`;
    }
  }
}
