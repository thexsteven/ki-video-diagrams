# ki-video-diagrams

Wizard-Web-UI: Thema eintragen, ein paar Fragen beantworten — im Hintergrund
läuft eine Claude-Code-Session, die den Skill `excalidraw-diagram` ausführt
und daraus ein sauberes **Excalidraw-Diagramm** im Whiteboard-Stil baut, als
importierbare `.excalidraw`-Datei plus PNG-Vorschau. Gebaut für die Diagramme
in deutschsprachigen KI-Erklärvideos: dunkles Theme, große Schrift, gut
lesbar auch als kleines Overlay im Screen-Recording.

Die Web-UI ist für zwei Personen gedacht (Betreiber + eine weitere, nicht
technisch versierte Person) und öffentlich über eine eigene Domain hinter
einem gemeinsamen Passwort erreichbar — siehe Abschnitt
["Sicherheit"](#sicherheit), bevor du das selbst deployst.

📄 Doku-Schicht (Entscheidungen, Kurzfassung) liegt in Google Drive unter
`AIOS/privat/projekte/ki-video-diagrams/`:
<https://drive.google.com/drive/folders/1UArFQZzbYwhXwM41zNllgxq0YAth_JWZ>

## Setup

```bash
npm install
```

Zusätzlich einmalig den Renderer des Skills einrichten (siehe
["Diagramm-Skill: Setup"](#diagramm-skill-setup) unten) — ohne den kann der
Skill keine PNG-Vorschau erzeugen.

## Web-UI starten

```bash
npm run web
```

Voraussetzungen:
- Skill-Renderer eingerichtet (siehe unten).
- Die `claude`-CLI im `PATH`, authentifiziert (`claude setup-token` oder
  bestehender Login).
- `.env` mit `APP_PASSWORD` und `SESSION_SECRET` (siehe `.env.example`) —
  ohne diese beiden startet der Server nicht.

Der Server läuft dann unter `http://127.0.0.1:5173` (Port über `PORT`
änderbar). Im Browser zuerst der Login (Passwort aus `APP_PASSWORD`), danach
der Fragen-Dialog: Thema, für wen das Bild ist, wie detailliert, was
vorkommen soll. Am Ende gibt es eine PNG-Vorschau und einen Download-Link für
die `.excalidraw`.

**Das Tool ersetzt Excalidraw nicht** — es liefert nur die Ausgangsdatei. Die
Feinarbeit (Positionen, Farben, Text verschieben) passiert danach ganz normal
auf [excalidraw.com](https://excalidraw.com).

## Diagramm-Skill: Setup

Das Tool nutzt ausschließlich den Skill unter
`.claude/skills/excalidraw-diagram/` — den unveränderten
[coleam00/excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill).
Er schreibt Excalidraw-JSON direkt von Hand (kein Mermaid/dagre-Layout
dazwischen), dadurch sind Layouts möglich, die ein automatisches Flowchart-
Layout nicht kann: Timelines, Fan-outs, Code-Snippets als „Evidence
Artifacts", frei platzierter Text ohne Boxen. Der Skill hat einen
eingebauten Render-View-Fix-Loop: erzeugtes JSON wird gerendert, das PNG
angeschaut, Fehler korrigiert — mehrere Runden, bis das Ergebnis stimmt.

Setup des Skill-Renderers (einmalig, **lokal** — braucht Internet):

```bash
cd .claude/skills/excalidraw-diagram/references
uv sync
uv run playwright install chromium
```

Farben an den Video-Look anpassen: `references/color-palette.md` ist die
einzige Datei, die dafür geändert werden muss.

## Sicherheit

**Wichtig, bevor du das öffentlich deployst.** Die Web-UI startet
`claude -p ... --dangerously-skip-permissions` — jeder Prompt, der durchs
gemeinsame Passwort kommt, kann beliebige Shell-Befehle im Container
ausführen (Dateien lesen/schreiben, mit dem Netzwerk-Zugriff des Containers
nach außen reden, alles tun, was der `app`-User darf). Es gibt bewusst kein
Sandboxing pro Auftrag — das ist für zwei vertraute Nutzer als Risiko
akzeptiert, aber sei dir bewusst: **ein geratenes oder geleaktes Passwort ist
gleichbedeutend mit vollem Zugriff auf den Container**, nicht nur auf ein
Diagramm-Tool.

Mitigationen, die tatsächlich umgesetzt sind:

1. **Rate-Limiting auf dem Login** (`src/auth.mjs`) — 5 Versuche pro 15
   Minuten und IP, danach Sperre. Macht Brute-Force unpraktikabel.
2. **Starkes, einzigartiges `APP_PASSWORD`** — generieren mit z. B.
   `openssl rand -base64 24`, nirgendwo sonst wiederverwenden. Wer es hat,
   hat vollen Zugriff — entsprechend behandeln.
3. **Container läuft als non-root** — ohnehin technisch nötig, weil
   `--dangerously-skip-permissions` als root außerhalb einer erkannten
   Sandbox verweigert wird.
4. **Minimale Secrets im Container:** nur `CLAUDE_CODE_OAUTH_TOKEN`,
   `APP_PASSWORD`, `SESSION_SECRET`, `PORT`. Keine weiteren Zugangsdaten,
   SSH-Keys o. Ä. in `.env` legen.
5. **Loopback-Bindung + Caddy davor** (siehe Deployment unten) — der
   Container ist nie direkt aus dem Internet erreichbar, nur über Caddys
   TLS-Terminierung.

Explizit **nicht** vorgesehen: Sandboxing/Isolation pro Auftrag,
IP-Allowlisting (würde die Nutzung von unterwegs verhindern), Abschalten von
`--dangerously-skip-permissions` (würde den kompletten Flow brechen).

## Aufbau

```
.claude/skills/excalidraw-diagram/   Skill (unverändert) + Renderer/Setup
output/web/{id}/                     erzeugte .excalidraw, .png, log.txt pro Auftrag
src/
  server.mjs          Express-Entrypoint, Routing, Static-Serving
  auth.mjs             Login/Session/Rate-Limiting
  jobs.mjs             In-Memory-Job-Queue (ein Auftrag gleichzeitig)
  promptTemplate.mjs   baut den Prompt aus den Wizard-Antworten
  public/
    login.html          Login-Seite
    index.html            Fragen-Dialog
    app.js
    style.css
```

## Deployment (Hetzner/Docker + Caddy)

Für den Dauerbetrieb läuft die Web-UI als Docker-Container auf dem Server
(apps-prod). Der Container bindet **nur** an `127.0.0.1` des Hosts; die
öffentliche Erreichbarkeit übernimmt Caddy, das TLS auf der echten Domain
terminiert und auf `127.0.0.1:5173` weiterleitet — der Container selbst ist
nie direkt aus dem Internet erreichbar.

### Was im Repo liegt

- `Dockerfile` — Node-LTS-Image mit Projekt-Dependencies, Python/`uv` +
  Chromium für den Skill-Renderer und der `claude`-CLI. Läuft als non-root
  User (nötig, damit `claude` `--dangerously-skip-permissions` akzeptiert).
- `docker-compose.yml` — Service-Block `ki-video-diagrams`. Port nur auf
  `127.0.0.1:5173:5173` gemappt, `restart: unless-stopped`, benanntes Volume
  `ki-video-output` für `output/`.
- `.env.example` — Vorlage für die Secrets (`CLAUDE_CODE_OAUTH_TOKEN`,
  `APP_PASSWORD`, `SESSION_SECRET`, `PORT`).

Im Container bindet der Server an `0.0.0.0` (über die Env-Var `HOST`), weil
Dockers Port-Mapping das Loopback *innerhalb* des Containers nicht erreicht.
Die Absicherung nach außen macht das Host-Mapping `127.0.0.1:...` plus Caddy
davor.

### Voraussetzungen zur Laufzeit

- Der Container braucht **ausgehendes Internet** (Claude-API sowie das
  ESM-Modul, das der Skill-Renderer beim PNG-Erzeugen von `esm.sh` lädt).
- Ein gültiger `CLAUDE_CODE_OAUTH_TOKEN`, ein starkes `APP_PASSWORD` und ein
  zufälliges `SESSION_SECRET` in der Server-`.env`.
- Eine Domain (bzw. Subdomain), deren DNS-Eintrag auf den Server zeigt, und
  ein laufender Caddy auf dem Host bzw. im `apps-prod`-Stack.

### Schritt für Schritt (Laptop + Server)

1. **Repo auf den Server holen.**

   ```bash
   git clone https://github.com/thexsteven/ki-video-diagrams.git
   cd ki-video-diagrams
   ```

2. **`.env` anlegen und ausfüllen.**

   ```bash
   cp .env.example .env
   ```

   `CLAUDE_CODE_OAUTH_TOKEN` per `claude setup-token` erzeugen (Browser-
   Login-Flow, auf dem Server ausführen; `claude` ggf. vorher installieren:
   `npm install -g @anthropic-ai/claude-code`). `APP_PASSWORD` und
   `SESSION_SECRET` wie in `.env.example` beschrieben generieren.

3. **Container bauen und starten.**

   ```bash
   docker compose build
   docker compose up -d
   ```

   Prüfen: `docker compose ps` (sollte `running` zeigen),
   `docker compose logs -f` (sollte `Web-UI läuft auf http://0.0.0.0:5173`
   melden), lokaler Test auf dem Server: `curl -I http://127.0.0.1:5173`
   (sollte auf `/login` umleiten).

4. **DNS-Eintrag setzen.** Eine (Sub-)Domain per A/AAAA-Record auf die
   Server-IP zeigen lassen.

5. **Caddy-Eintrag ergänzen.** In der Caddyfile des Hosts bzw. des
   `apps-prod`-Stacks:

   ```
   deine-domain.tld {
       reverse_proxy 127.0.0.1:5173
   }
   ```

   Caddy neu laden (`caddy reload` bzw. den entsprechenden
   `docker compose`-Restart des Caddy-Dienstes im Stack).

6. **Von außen testen.**

   ```bash
   curl -I https://deine-domain.tld
   ```

   sollte `HTTP/2 302` auf `/login` zeigen. Im Browser die Domain öffnen,
   mit `APP_PASSWORD` anmelden, ein Testthema eingeben und prüfen, dass eine
   `.excalidraw` (und eine PNG-Vorschau) erzeugt wird.

Neue Version ausrollen später: `git pull` auf dem Server, dann
`docker compose build && docker compose up -d`.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
