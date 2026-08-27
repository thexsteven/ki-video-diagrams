const wizardForm = document.getElementById("wizard-form");

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

function showForm() {
  clearInterval(pollTimer);
  statusSection.classList.add("hidden");
  wizardForm.classList.remove("hidden");
}

function showRunning() {
  wizardForm.classList.add("hidden");
  statusSection.classList.remove("hidden");
  statusRunning.classList.remove("hidden");
  statusError.classList.add("hidden");
  statusDone.classList.add("hidden");
  statusText.textContent = "Dein Diagramm wird erstellt …";
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

async function submitJob(answers) {
  showRunning();
  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
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
      statusText.textContent =
        job.status === "queued" ? "Dein Auftrag wartet kurz in der Warteschlange …" : "Dein Diagramm wird erstellt …";
    }
  } catch (err) {
    // Netzwerk-Hänger beim Polling: einfach beim nächsten Intervall erneut versuchen.
  }
}

wizardForm.addEventListener("submit", (e) => {
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
  submitJob(answers);
});

document.getElementById("retry-button").addEventListener("click", showForm);
document.getElementById("new-button").addEventListener("click", showForm);
