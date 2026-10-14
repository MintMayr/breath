# Atemtrainer

Kleine Web-App für das Atemtraining fürs Tauchen, optimiert fürs Handy.

- **Zwerchfellatmung**: 4 s ein, 6–8 s aus, 5 oder 10 Minuten
- **Lippenbremse**: 3 s ein, 6–12 s gegen die Lippen aus
- **CO₂-Tabelle**: feste Haltezeit oder 50 % der eigenen Bestzeit, Erholung sinkt von 1:00 auf 0:20
- **Verlauf**: Serie, Kalender wie bei GitHub, Minuten pro Woche, Entwicklung von Ausatem- und
  Haltezeit; Daten als JSON sichern und laden
- **Bewertung** nach jeder Einheit, daraus ein Vorschlag für eine Stufe mehr oder weniger
- **Wissen**: warum die Übungen so aufgebaut sind, mit Evidenz-Einstufung und Quellen
- Wochenplan, Signale per Ton oder Stimme, Bildschirm bleibt an
- Installierbar und offline nutzbar (PWA)

## Am Handy installieren

Seite im Browser öffnen, dann „Zum Startbildschirm hinzufügen“ (iOS: Teilen-Menü, Android: Menü
oben rechts). Danach startet die App wie eine normale App und funktioniert auch ohne Netz.

## Datenschutz

Kein Konto, kein Server, kein Tracking. Die App lädt nichts von fremden Servern; alle Daten bleiben
im Browser auf deinem Gerät. Sie verlassen es nur, wenn du sie selbst mit „Daten sichern“
exportierst.

## Entwicklung

Voraussetzung: Node.js 22.13 oder neuer (empfohlen: Version aus `.nvmrc`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # Typecheck, Lint, Format, Tests
npm run build    # Produktionsbuild nach dist/
npm run preview  # Build ausliefern, z. B. um den Offline-Modus zu testen
```

Aufbau, Konventionen und offene Punkte stehen in [CLAUDE.md](CLAUDE.md).

## Sicherheit

CO₂-Übungen nur an Land, im Sitzen oder Liegen, nie im oder am Wasser und nie allein im Wasser
üben. Nie vor dem Luftanhalten hyperventilieren. Bei Schwindel, Kribbeln oder Sehstörungen sofort
normal weiteratmen. Die App ersetzt keine Tauch- oder Apnoeausbildung.
