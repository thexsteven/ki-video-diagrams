#!/usr/bin/env node
/**
 * Web-UI: Fragen-Dialog (Thema/Zielgruppe/Tiefe/Komponenten) -> Prompt ->
 * Claude Code führt den excalidraw-diagram-Skill aus -> .excalidraw + PNG.
 *
 * Öffentlich erreichbar hinter einem geteilten Passwort (src/auth.mjs) —
 * siehe README, Abschnitt "Sicherheit", für das Bedrohungsmodell: die
 * claude-CLI läuft mit --dangerously-skip-permissions, das Passwort ist
 * daher wie ein Root-Zugang zu behandeln.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAuthRouter, requireAuth, sessionMiddleware } from "./auth.mjs";
import { createJob, getJob } from "./jobs.mjs";
import { buildWizardPrompt } from "./promptTemplate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "src", "public");
const PORT = Number(process.env.PORT) || 5173;
// Lokal an localhost gebunden. Im Container muss auf 0.0.0.0 gebunden werden,
// weil das Docker-Port-Mapping nicht das Loopback des Containers erreicht —
// die Absicherung nach außen übernimmt dort Caddy (siehe docker-compose.yml).
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
app.set("trust proxy", 1); // Caddy steht davor — echte Client-IP aus X-Forwarded-For lesen
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Login-Formular (application/x-www-form-urlencoded)
app.use(sessionMiddleware());
app.use(createAuthRouter(PUBLIC_DIR));

// Statische Assets (CSS/JS/login.html) sind ohne Login ladbar — sie enthalten
// keine Daten, nur so bleibt die Login-Seite selbst gestylt. `index: false`
// verhindert, dass "/" automatisch das ungeschützte index.html ausliefert;
// das übernimmt die Route unten mit explizitem Auth-Check.
app.use(express.static(PUBLIC_DIR, { index: false }));

app.get("/", (req, res) => {
  if (!req.session?.authed) return res.redirect("/login");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use("/output/web", requireAuth, express.static(path.join(ROOT, "output", "web")));
app.use("/api", requireAuth);

app.post("/api/jobs", (req, res) => {
  const answers = req.body?.answers ?? {};
  if (!answers.topic || !answers.topic.trim()) {
    return res.status(400).json({ error: "Thema fehlt." });
  }
  const concept = buildWizardPrompt(answers);
  const id = createJob(ROOT, concept);
  res.status(201).json({ jobId: id });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job nicht gefunden." });
  res.json(job);
});

app.listen(PORT, HOST, () => {
  console.log(`Web-UI läuft auf http://${HOST}:${PORT}`);
});
