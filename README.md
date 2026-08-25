# ki-video-diagrams

Erzeugt aus einer Mermaid-Datei ein sauberes **Excalidraw-Diagramm** im
Whiteboard-Stil — als importierbare `.excalidraw`-Datei plus PNG-Vorschau.
Gebaut für die Diagramme in meinen deutschsprachigen KI-Erklärvideos: dunkles
Theme, große Schrift, gut lesbar auch als kleines Overlay im Screen-Recording.

Für ein neues Video kommt eine neue `.mmd`-Datei in `diagrams/` — der Rest ist
ein Kommando.

📄 Doku-Schicht (Entscheidungen, Kurzfassung) liegt in Google Drive unter
`AIOS/privat/projekte/ki-video-diagrams/`:
<https://drive.google.com/drive/folders/1UArFQZzbYwhXwM41zNllgxq0YAth_JWZ>

![Der Agenten-Loop](output/reason-act-observe.png)

## Setup

```bash
npm install
npx playwright install chromium   # einmalig
npm run build                     # Browser-Bundle bauen
```

Der Build-Schritt ist nötig, weil `@excalidraw/mermaid-to-excalidraw` für die
Layout-Berechnung mermaid.js und damit ein echtes DOM braucht. Das Tool startet
deshalb ein headless Chromium (Playwright), lässt die Konvertierung dort laufen
und holt Elemente und PNG wieder heraus.

## Ein Diagramm erzeugen

```bash
npm run generate -- --input diagrams/reason-act-observe.mmd \
                    --out output/reason-act-observe \
                    --layout circle
```

Ergebnis: `output/reason-act-observe.excalidraw` (auf
[excalidraw.com](https://excalidraw.com) per *Datei → Öffnen* importierbar) und
`output/reason-act-observe.png`.

### Optionen

| Option | Default | Bedeutung |
| --- | --- | --- |
| `--input` | – | Pfad zur `.mmd`-Datei (Pflicht) |
| `--out` | – | Ausgabepfad **ohne** Endung (Pflicht) |
| `--layout` | `mermaid` | `mermaid` = dagre-Layout, `circle` = Knoten als Kreis |
| `--theme` | `dark` | `dark` oder `light` |
| `--scale` | `2` | PNG-Auflösung (2 = retina) |
| `--font-size` | `22` | Schriftgröße, an mermaid durchgereicht |
| `--padding` | `40` | Rand um das PNG |
| `--bow` | `0.14` | Wie stark sich die Kreis-Pfeile nach außen wölben |

`CHROMIUM_PATH=/pfad/zu/chrome` nutzt ein bereits vorhandenes Chromium, statt
das von Playwright installierte zu suchen (praktisch in Containern/CI).

## Für ein neues Video

1. Neue Datei in `diagrams/` anlegen, z.B. `diagrams/rag-pipeline.mmd`:

   ```mermaid
   flowchart LR
       A["Frage<br/><br/>Nutzer-Eingabe"]
       B["Retrieval<br/><br/>Passende Chunks<br/>aus dem Index"]
       C["Antwort<br/><br/>LLM formuliert<br/>mit Kontext"]

       A --> B
       B --> C
   ```

2. Erzeugen:

   ```bash
   npm run generate -- --input diagrams/rag-pipeline.mmd --out output/rag-pipeline
   ```

3. PNG anschauen, bei Bedarf `.excalidraw` in excalidraw.com öffnen und von Hand
   nachjustieren.

### Konventionen, die sich bewährt haben

- **Schlagwort, Leerzeile, Beschreibung:** `"Act<br/><br/>Tool wird<br/>ausgeführt"`.
  Die Leerzeile lässt die Kopfzeile beim schnellen Überfliegen heraussstechen —
  wichtig, wenn das Diagramm im Video nur ein Viertel des Bildes einnimmt.
- **Zeilen selbst umbrechen** mit `<br/>`, statt lange Labels automatisch
  umbrechen zu lassen. Ergibt gleichmäßigere Knoten.
- **Zyklen immer mit `--layout circle`.** Mermaid/dagre layoutet hierarchisch
  und macht aus einem Loop sonst eine Reihe mit langem Rückpfeil.

## Aufbau

```
diagrams/   Mermaid-Quelldateien (eine pro Diagramm)
output/     erzeugte .excalidraw- und .png-Dateien
src/
  generate.mjs      CLI: Argumente, Playwright, Dateien schreiben
  browser-entry.js  läuft im Browser: mermaid -> Excalidraw-Elemente
  layout.mjs        Kreis-Layout für zyklische Diagramme
  themes.mjs        Farbschemata (dark/light)
  web/              Web-UI: Prompt bauen -> claude-CLI ausführen -> Ergebnis anzeigen
docs/
  iterations.md     Qualitäts-Loop des ersten Diagramms
```

## Skill: freie Diagramme ohne Mermaid

Unter `.claude/skills/excalidraw-diagram/` liegt der Skill
[coleam00/excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill)
(unverändert, Stand `8646fcc`). Er schreibt Excalidraw-JSON direkt von Hand,
statt über Mermaid — dadurch sind Layouts möglich, die dagre nicht kann:
Timelines, Fan-outs, Code-Snippets als „Evidence Artifacts", frei platzierter
Text ohne Boxen.

**Wann was:**

| | `npm run generate` | Skill `excalidraw-diagram` |
| --- | --- | --- |
| Eingabe | `.mmd`-Datei | Beschreibung in Prosa |
| Layout | mermaid/dagre + `--layout circle` | frei, von Hand platziert |
| Gut für | Flows, Loops, alles Wiederholbare | einmalige, erklärende Video-Diagramme |
| Reproduzierbar | ja, aus der `.mmd` | nein, das JSON ist das Original |

Setup des Skill-Renderers (einmalig, **lokal** — braucht Internet):

```bash
cd .claude/skills/excalidraw-diagram/references
uv sync
uv run playwright install chromium
```

Farben an den Video-Look anpassen: `references/color-palette.md` ist die einzige
Datei, die dafür geändert werden muss.

## Web-UI: Diagramme per Browser erzeugen

Statt den Skill manuell in einer Claude-Code-Session anzustoßen, gibt es unter
`src/web/` eine kleine, mobile-taugliche Weboberfläche. Man beschreibt dort
sein Konzept — frei formuliert oder über einen festen Fragen-Dialog (Thema,
Zielgruppe, Tiefe, Kernkomponenten) — die Seite baut daraus einen Prompt, und
im Hintergrund läuft eine `claude`-CLI-Session, die den Skill
`excalidraw-diagram` ausführt (inkl. dessen Render-View-Fix-Loop). Am Ende gibt
es eine PNG-Vorschau und einen Download-Link für die `.excalidraw`.

**Das Tool ersetzt Excalidraw nicht** — es liefert nur die Ausgangsdatei. Die
Feinarbeit (Positionen, Farben, Text verschieben) passiert danach ganz normal
in Excalidraw selbst.

### Starten

```bash
npm run web
```

Voraussetzungen:
- `.claude/skills/excalidraw-diagram/references` muss einmalig eingerichtet
  sein (siehe oben, `uv sync` + `uv run playwright install chromium`).
- Die `claude`-CLI muss im `PATH` verfügbar und bereits authentifiziert sein.

Der Server läuft dann unter `http://127.0.0.1:5173` (Port über `PORT`
änderbar).

### Sicherheitshinweis — nur lokal, nicht öffentlich hosten

Der Server bindet bewusst nur an `127.0.0.1` und startet `claude` mit
`--dangerously-skip-permissions`, damit die Web-Session ohne manuelles
Freigeben im Terminal durchläuft. Das ist nur vertretbar, solange ausschließlich
der Betreiber selbst Zugriff hat: Skip-Permissions bedeutet, dass jeder
eingereichte Prompt Claude Code dazu bringen kann, beliebige Bash-Befehle auf
dem Server auszuführen. **Bevor diese Oberfläche für andere Personen erreichbar
gemacht wird**, braucht es zusätzlich: Authentifizierung, isolierte/sandboxed
Ausführung pro Job (z.B. Container ohne Zugriff auf Secrets anderer Jobs) und
eine eingeschränkte Tool-Liste statt Skip-Permissions.

## Das erste Diagramm

`diagrams/reason-act-observe.mmd` — der Agenten-Loop (Reason → Act → Observe →
zurück zu Reason). Es entstand über sieben Runden aus generate → observe →
critique → refine; was in welcher Runde warum geändert wurde, steht in
[`docs/iterations.md`](docs/iterations.md).

## Lizenz

MIT — siehe [LICENSE](LICENSE).
