#!/usr/bin/env node
/**
 * Lokale Web-UI: Konzeptbeschreibung (frei oder per Fragen-Dialog) -> Prompt
 * -> Claude Code führt den excalidraw-diagram-Skill aus -> .excalidraw + PNG.
 *
 * Bewusst nur an localhost gebunden, kein Auth: siehe README, Abschnitt
 * "Web-UI" für die Sicherheitsüberlegungen, bevor das je öffentlich läuft.
 */
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createJob, getJob } from "./jobs.mjs";
import { buildWizardPrompt } from "./promptTemplate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.PORT) || 5173;
const HOST = "127.0.0.1";

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, "src", "web", "public")));
app.use("/output/web", express.static(path.join(ROOT, "output", "web")));

app.post("/api/jobs", (req, res) => {
  const body = req.body ?? {};
  let concept;

  if (body.mode === "wizard") {
    const answers = body.answers ?? {};
    if (!answers.topic || !answers.topic.trim()) {
      return res.status(400).json({ error: "Thema fehlt." });
    }
    concept = buildWizardPrompt(answers);
  } else {
    if (!body.prompt || !body.prompt.trim()) {
      return res.status(400).json({ error: "Prompt fehlt." });
    }
    concept = body.prompt.trim();
  }

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
