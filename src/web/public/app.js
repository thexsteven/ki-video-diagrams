const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab.dataset.tab));
  });
});

const chipGroup = document.querySelector('.chip-group[data-name="depth"]');
const depthInput = document.querySelector('input[name="depth"]');
chipGroup.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chipGroup.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    depthInput.value = chip.dataset.value;
  });
});

const statusSection = document.getElementById("status");
const statusRunning = document.getElementById("status-running");
const statusError = document.getElementById("status-error");
const statusDone = document.getElementById("status-done");
const statusText = document.getElementById("status-text");
const errorText = document.getElementById("error-text");
const resultPng = document.getElementById("result-png");
const downloadLink = document.getElementById("download-link");

let pollTimer = null;

function showForms() {
  clearInterval(pollTimer);
  statusSection.classList.add("hidden");
  document.querySelector(".tabs").classList.remove("hidden");
  const activeTab = document.querySelector(".tab.active").dataset.tab;
  panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== activeTab));
}

function showRunning() {
  document.querySelector(".tabs").classList.add("hidden");
  panels.forEach((panel) => panel.classList.add("hidden"));
  statusSection.classList.remove("hidden");
  statusRunning.classList.remove("hidden");
  statusError.classList.add("hidden");
  statusDone.classList.add("hidden");
  statusText.textContent = "Claude Code arbeitet …";
}

function showError(message) {
  statusRunning.classList.add("hidden");
  statusDone.classList.add("hidden");
  statusError.classList.remove("hidden");
  errorText.textContent = message;
}

function showDone(files) {
  statusRunning.classList.add("hidden");
  statusError.classList.add("hidden");
  statusDone.classList.remove("hidden");
  if (files.png) {
    resultPng.src = files.png;
    resultPng.classList.remove("hidden");
  } else {
    resultPng.classList.add("hidden");
  }
  downloadLink.href = files.excalidraw;
}

async function submitJob(body) {
  showRunning();
  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || `Fehler beim Starten (${res.status}).`);
      return;
    }
    const { jobId } = await res.json();
    pollTimer = setInterval(() => pollJob(jobId), 3000);
    pollJob(jobId);
  } catch (err) {
    showError(`Netzwerkfehler: ${err.message}`);
  }
}

async function pollJob(jobId) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) {
      clearInterval(pollTimer);
      showError("Job nicht gefunden.");
      return;
    }
    const job = await res.json();
    if (job.status === "done") {
      clearInterval(pollTimer);
      showDone(job.files);
    } else if (job.status === "error") {
      clearInterval(pollTimer);
      showError(job.error || "Unbekannter Fehler.");
    } else {
      statusText.textContent = job.status === "queued" ? "Job wartet in der Warteschlange …" : "Claude Code arbeitet …";
    }
  } catch (err) {
    // Netzwerk-Hänger beim Polling: einfach beim nächsten Intervall erneut versuchen.
  }
}

document.getElementById("free-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const prompt = document.getElementById("free-prompt").value.trim();
  if (!prompt) return;
  submitJob({ mode: "free", prompt });
});

document.getElementById("wizard-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const answers = {
    topic: form.topic.value.trim(),
    audience: form.audience.value.trim(),
    depth: form.depth.value,
    components: form.components.value.trim(),
    patterns: form.patterns.value.trim(),
  };
  if (!answers.topic) return;
  submitJob({ mode: "wizard", answers });
});

document.getElementById("retry-button").addEventListener("click", showForms);
document.getElementById("new-button").addEventListener("click", showForms);
