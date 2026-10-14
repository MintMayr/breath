# Atemtrainer

Mobile Web-App für Atemtraining zum Tauchen: Zwerchfellatmung, Lippenbremse und CO₂-Tabellen
mit Wochenplan, Verlauf (Serie, Kalender, Entwicklung) und einer Wissen-Seite. Vanilla
TypeScript + Vite, kein Framework, kein Backend. Daten liegen in `localStorage`, die App ist als
PWA installierbar und läuft offline. UI-Texte und Kommentare sind auf Deutsch.

## Befehle

| Befehl             | Zweck                                               |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Dev-Server mit HMR (ohne Service Worker)            |
| `npm run build`    | Typecheck + Produktionsbuild nach `dist/` inkl. PWA |
| `npm run preview`  | Build lokal ausliefern, z. B. um offline zu testen  |
| `npm test`         | Unit-Tests (Vitest), einmalig                       |
| `npm run check`    | Typecheck, Lint, Formatprüfung, Tests – wie in CI   |
| `npm run lint:fix` | ESLint-Autofix                                      |
| `npm run icons`    | App-Icons aus `public/favicon.svg` neu erzeugen     |

Vor jedem Commit muss `npm run check` grün sein.

## Architektur

```
src/
  core/      Reine Logik. Kein DOM, keine Browser-Globals, keine eigene Uhr.
  platform/  Dünne Wrapper um Browser-APIs (localStorage, Web Audio, Speech, Wake Lock,
             Vibration, Dateien, Service Worker).
  ui/        DOM-Code. app.ts ist der Controller, der core und platform verbindet.
  main.ts    Einstiegspunkt.
```

Abhängigkeiten zeigen nur nach innen: `ui → platform → core`, `ui → core`. `core` importiert nie
aus `ui` oder `platform`.

Wichtige Stellen:

- `core/session.ts`: Zeitsteuerung einer Einheit. Bekommt `now` (ms, `performance.now()`) bei jedem
  Aufruf übergeben und rechnet mit absoluten Phasen-Endzeiten, daher driftfrei und ohne Fake-Timer
  testbar. Ein pausiertes Luftanhalten wird beim Fortsetzen übersprungen (Absicht, siehe Tests) und
  zählt wie „Jetzt atmen“ als vorzeitig beendet (`cutHolds`).
- `core/settings.ts`: `SETTING_SPECS` ist die **einzige** Quelle für erlaubte Werte. UI
  (Segment-Buttons vs. Stepper) und Validierung lesen beide daraus. Keine Grenzen woanders
  hartkodieren. `co2HoldFor` liefert die tatsächliche Haltezeit (fest oder 50 % der Bestzeit,
  eingerastet in die Grenzen von `co2Hold`).
- `core/history.ts`: Verlauf als Liste abgeschlossener Einheiten (`SessionRecord`, sortiert nach
  `at`), behält 730 Trainingstage. Bereinigen, Zusammenführen (Import) und Migration aus Format v2.
- `core/stored-data.ts`: Speicherformat mit Versionsnummer (aktuell 3, Schlüssel heißt historisch
  `atemtrainer.v2`). Formatänderung → `STORAGE_VERSION` erhöhen, Migration in `parseStoredData`
  ergänzen, Test schreiben. Gespeicherte und importierte Daten gelten als nicht vertrauenswürdig und
  werden immer bereinigt.
- `core/progress.ts`: Auswertungen für die Verlauf-Seite (Kalender, Serie, Wochen, Kurven).
- `core/progression.ts`: Vorschlag „eine Stufe mehr/weniger“ aus Bewertung und voll gehaltenen
  Runden.
- `core/plan.ts`: Wochenplan (Zwerchfell täglich, Mo/Mi/Fr CO₂, Di/Do Lippenbremse).
- `ui/app.ts`: Zustand ist `session` (läuft/pausiert) bzw. `finished` (Geschafft-Bildschirm),
  daraus wird `view` abgeleitet. Dazu `tab` (Training/Verlauf/Wissen). Bei verborgenem Tab wird
  automatisch pausiert.
- `ui/progress-view.ts`: zeichnet die Verlauf-Seite (SVG/DOM, keine Chart-Bibliothek).
- Die Wissen-Seite ist statisches HTML in `index.html`. Jede Aussage trägt ein Evidenz-Badge
  (Gut belegt / Erste Hinweise / Erfahrungswissen); Quellen nur aufnehmen, wenn Titel, Journal und
  DOI geprüft sind.

## Konventionen

- TypeScript strict inkl. `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes`.
  `erasableSyntaxOnly` ist an: keine `enum`s, keine Parameter-Properties im Konstruktor.
- Neue Logik gehört nach `core/` und bekommt einen Test daneben (`*.test.ts`). UI-Code bleibt dünn.
- Datumslogik immer in lokaler Zeit über Jahr/Monat/Tag (`addDays`, `parseDateKey`), nie über
  Millisekunden-Arithmetik (Sommerzeit). Einzige Ausnahme ist `daysBetween`, das reine
  UTC-Datumswerte vergleicht. Tests erzeugen Daten mit `new Date(y, m, d, h)`, damit sie in jeder
  Zeitzone laufen.
- DOM wird per `createElement`/`textContent` gebaut (`el()` in `ui/dom.ts`, `svgEl()` in
  `ui/svg.ts`), nicht über `innerHTML`.
- Browser-APIs, die fehlen oder werfen können (Audio, Speech, Wake Lock, Vibration, Storage,
  Dateien, Service Worker), sind in `platform/` gekapselt und schlagen still fehl. Die Übung muss
  auch ohne sie funktionieren.
- Keine Anfragen an fremde Server (keine CDNs, Analytics, externen Schriften). Die CSP in
  `vite.config.ts` erzwingt das im Build; wer sie lockert, braucht einen guten Grund. Externe
  Links immer mit `rel="noopener noreferrer"`.
- Diagrammfarben sind Tokens in `styles.css` (`--chart`, `--heat-0…3`) und wurden für Hell und
  Dunkel gegen `--surface` geprüft (Kontrast, Helligkeitsstufen). Beim Ändern neu prüfen.
- `typescript` ist auf `~6.0` gepinnt, weil typescript-eslint TypeScript 7 noch nicht unterstützt.
  Erst anheben, wenn typescript-eslint es tut.

## Fachliche Leitplanken (nicht verhandelbar)

Das ist ein Trainingswerkzeug für Apnoe-nahe Übungen. Fehler können real gefährlich sein.

- CO₂-Training nur an Land, sitzend oder liegend. Der Sicherheitshinweis im CO₂-Modus bleibt sichtbar.
- Keine Funktionen, die Hyperventilation vor dem Luftanhalten anleiten oder belohnen.
- Keine Funktionen für Übungen im oder am Wasser.
- „Jetzt atmen“ muss während des Haltens jederzeit mit einem Tipp erreichbar sein. Deshalb sind
  Tab-Leiste, Serien-Chip und Update-Hinweis während einer Einheit ausgeblendet bzw. gesperrt,
  und ein Update lädt nie von selbst neu.
- Grenzen für Haltezeit und Runden nicht ohne bewusste Entscheidung erweitern. Auch die Haltezeit
  aus der Bestzeit bleibt in den Grenzen von `co2Hold`.
- Kein Maximalversuch/Stoppuhr-Test in der App; die Bestzeit wird nur eingetragen.
- Verlauf und Serie belohnen nie längeres Halten: Die Kalenderstufe zählt verschiedene Übungen pro
  Tag, eine zweite CO₂-Tabelle zählt nicht extra. Früh atmen wird neutral angezeigt und bricht
  die Serie nicht.
- Vorschläge ändern höchstens eine Stufe, bleiben in `SETTING_SPECS` und werden nie automatisch
  angewendet.

## Bekannte Grenzen / Backlog

- **Daten nur auf einem Gerät.** `localStorage` ist pro Browser; Sichern/Laden als JSON gibt es auf
  der Verlauf-Seite, eine automatische Synchronisierung nicht.
- **Kein Browser-Test.** Unit-Tests decken `core/` ab, die UI nicht. Ein Playwright-Test mit
  `page.clock` (gefakte Uhr) könnte eine ganze Einheit in Sekunden durchspielen und prüfen, dass
  „Jetzt atmen“ immer erreichbar ist und die Tab-Leiste während der Einheit fehlt.

## Deployment

CI (`.github/workflows/ci.yml`) prüft jeden Push und deployt `main` auf GitHub Pages
(Repo-Einstellung: Pages → Source: GitHub Actions). Der Build nutzt `base: './'` und funktioniert
daher unter jedem Pfad. Das Repo ist öffentlich: Commits nur mit der GitHub-noreply-Adresse, keine
persönlichen Daten, Pfade oder Sitzungslinks in Code, Commits oder PRs.
