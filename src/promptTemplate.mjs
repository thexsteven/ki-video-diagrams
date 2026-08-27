/**
 * Baut aus einer Nutzer-Beschreibung (frei oder aus dem Fragen-Dialog) den
 * fertigen Prompt für Claude Code: die Konzeptbeschreibung plus feste
 * Anweisungen, welchen Skill zu nutzen ist und wohin das Ergebnis muss, damit
 * jobs.mjs es deterministisch wiederfindet.
 */

/**
 * @param {{ topic: string, audience?: string, depth?: "einfach" | "technisch", components?: string, patterns?: string }} answers
 */
export function buildWizardPrompt(answers) {
  const lines = [`Thema: ${answers.topic}`];
  if (answers.audience) lines.push(`Zielgruppe: ${answers.audience}`);
  lines.push(
    answers.depth === "technisch"
      ? "Tiefe: technisch/umfassend — mit Evidence Artifacts (echte Formate, Code-Snippets, konkrete Beispiele)."
      : "Tiefe: einfach/konzeptionell — abstrakte Formen reichen, kein technisches Detail nötig.",
  );
  if (answers.components) lines.push(`Kernkomponenten/Schritte: ${answers.components}`);
  if (answers.patterns) lines.push(`Gewünschte visuelle Patterns: ${answers.patterns}`);
  return lines.join("\n");
}

/**
 * Umschließt eine Konzeptbeschreibung mit der festen Anweisung an Claude
 * Code: welcher Skill, welcher Zielpfad.
 *
 * @param {string} concept
 * @param {string} outDir absoluter Pfad zum Job-Ausgabeordner
 */
export function buildClaudeCodePrompt(concept, outDir) {
  return [
    "Nutze den Skill excalidraw-diagram (.claude/skills/excalidraw-diagram/), um ein Excalidraw-Diagramm für folgendes Konzept zu erstellen:",
    "",
    concept,
    "",
    "Wichtig:",
    `- Speichere die fertige Datei exakt unter ${outDir}/diagram.excalidraw`,
    `- Rendere zusätzlich eine finale PNG-Vorschau exakt unter ${outDir}/diagram.png (mit render_excalidraw.py aus dem Skill, danach die entstandene PNG dorthin kopieren/umbenennen)`,
    "- Führe den im Skill beschriebenen Render-View-Fix-Loop durch, bevor du fertig bist.",
    "- Erzeuge keine weiteren Dateien außerhalb dieses Ordners.",
  ].join("\n");
}
