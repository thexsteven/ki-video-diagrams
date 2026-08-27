# Web-UI für ki-video-diagrams als Container.
#
# Enthält alles, was die Oberfläche zum Erzeugen von Diagrammen braucht:
#   - Node + die Projekt-Dependencies (npm ci)
#   - Python + uv + Chromium für den excalidraw-diagram-Skill (dessen
#     render-view-fix-Loop rendert PNGs über uv/Playwright)
#   - die claude-CLI, die die Web-UI im Hintergrund aufruft
#
# Läuft bewusst als non-root User: die claude-CLI verweigert
# --dangerously-skip-permissions als root außerhalb einer erkannten Sandbox,
# ein normaler Container-User genügt ihr aber.

FROM node:22-bookworm

# Playwright-Installation des Skill-Renderers teilt sich diesen Pfad, damit
# der non-root User zur Laufzeit den Browser findet.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# uv (Python-Paketmanager, den der Skill-Renderer nutzt) aus dem offiziellen Image.
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

# Python für den Skill-Renderer (Playwright-Systemabhängigkeiten kommen weiter
# unten über `playwright install --with-deps`).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# claude-CLI global ins Image.
RUN npm install -g @anthropic-ai/claude-code

# non-root User anlegen; Zielverzeichnisse ihm gehören lassen.
RUN useradd --create-home --shell /bin/bash app \
 && mkdir -p /app /ms-playwright \
 && chown -R app:app /app /ms-playwright

WORKDIR /app

# Erst nur die Manifeste kopieren -> npm-ci-Layer wird gecacht, solange sie
# sich nicht ändern.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Restliche Quellen.
COPY . .

# Skill-Renderer einrichten: Python-venv + Chromium samt System-Libs
# (--with-deps braucht root für apt, deshalb noch vor USER app).
RUN cd .claude/skills/excalidraw-diagram/references \
 && uv sync \
 && uv run playwright install --with-deps chromium

# Alles dem non-root User übereignen (npm ci / uv sync liefen als root).
RUN chown -R app:app /app /ms-playwright

USER app

# Standard-Port; per PORT-Env-Var überschreibbar.
ENV PORT=5173
# Im Container an 0.0.0.0 binden, damit das Docker-Port-Mapping greift.
# Die Absicherung nach außen macht das Host-Mapping (nur 127.0.0.1) in compose.
ENV HOST=0.0.0.0

EXPOSE 5173

CMD ["npm", "run", "web"]
