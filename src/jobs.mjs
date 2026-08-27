/**
 * In-Memory-Job-Queue für Diagramm-Anfragen. Konkurrenz bewusst auf 1
 * begrenzt: mehrere gleichzeitige `claude`-Prozesse würden sich nicht in die
 * Quere kommen (jeder Job hat einen eigenen Ordner), aber unkontrolliert
 * Ressourcen verbrauchen — für ein lokales Einzelnutzer-Tool reicht seriell.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { buildClaudeCodePrompt } from "./promptTemplate.mjs";

const jobs = new Map();
const queue = [];
let working = false;

function publicJob(job) {
  const { id, status, error, files, createdAt } = job;
  return { id, status, error, files, createdAt };
}

export function getJob(id) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

export function createJob(root, concept) {
  const id = randomUUID();
  const outDir = path.join(root, "output", "web", id);
  const job = {
    id,
    status: "queued",
    error: null,
    files: null,
    createdAt: Date.now(),
    root,
    outDir,
    prompt: buildClaudeCodePrompt(concept, outDir),
  };
  jobs.set(id, job);
  queue.push(id);
  runNext();
  return id;
}

async function runNext() {
  if (working) return;
  const id = queue.shift();
  if (!id) return;
  working = true;
  const job = jobs.get(id);
  try {
    await runJob(job);
  } finally {
    working = false;
    runNext();
  }
}

async function runJob(job) {
  job.status = "running";
  await fsp.mkdir(job.outDir, { recursive: true });
  const logStream = fs.createWriteStream(path.join(job.outDir, "log.txt"));

  await new Promise((resolve) => {
    const child = spawn("claude", ["-p", job.prompt, "--dangerously-skip-permissions"], {
      cwd: job.root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.on("error", (error) => {
      job.status = "error";
      job.error = `claude-CLI konnte nicht gestartet werden: ${error.message}`;
      logStream.end();
      resolve();
    });
    child.on("close", (code) => {
      logStream.end();
      finalizeJob(job, code).then(resolve);
    });
  });
}

async function finalizeJob(job, exitCode) {
  if (job.status === "error") return; // spawn ist schon fehlgeschlagen
  const excalidrawPath = path.join(job.outDir, "diagram.excalidraw");
  const pngPath = path.join(job.outDir, "diagram.png");
  const hasExcalidraw = await fileExists(excalidrawPath);
  if (exitCode !== 0 || !hasExcalidraw) {
    job.status = "error";
    job.error =
      `claude-CLI beendet mit Code ${exitCode}, erwartete Datei fehlt. ` +
      `Details in ${path.relative(job.root, path.join(job.outDir, "log.txt"))}.`;
    return;
  }
  job.status = "done";
  job.files = {
    excalidraw: `/output/web/${job.id}/diagram.excalidraw`,
    png: (await fileExists(pngPath)) ? `/output/web/${job.id}/diagram.png` : null,
  };
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
