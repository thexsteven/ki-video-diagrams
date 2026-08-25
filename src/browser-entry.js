/**
 * Wird von esbuild zu build/converter.bundle.js gebündelt und in einer
 * headless Chromium-Seite geladen. Grund: @excalidraw/mermaid-to-excalidraw
 * nutzt mermaid.js für die Layout-Berechnung und braucht dafür ein echtes DOM.
 */
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements, exportToBlob } from "@excalidraw/excalidraw";

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * mermaid-to-excalidraw übernimmt den rohen Label-Text aus mermaid, wandelt
 * <br> aber nicht in einen Zeilenumbruch um. Das holen wir hier nach — und
 * zwar noch am Skeleton, damit Excalidraw den mehrzeiligen Text anschließend
 * selbst vermisst und die Knoten korrekt dimensioniert.
 */
const BR = /<br\s*\/?>/gi;

function normalizeLineBreaks(elements) {
  return elements.map((element) => {
    const next = { ...element };
    if (typeof next.text === "string") next.text = next.text.replace(BR, "\n");
    if (next.label && typeof next.label.text === "string") {
      next.label = { ...next.label, text: next.label.text.replace(BR, "\n") };
    }
    return next;
  });
}

/** Mermaid-Text -> fertige Excalidraw-Elemente (noch ungestyled). */
window.mermaidToElements = async (definition, mermaidConfig) => {
  const { elements, files } = await parseMermaidToExcalidraw(definition, mermaidConfig);
  return {
    elements: convertToExcalidrawElements(normalizeLineBreaks(elements)),
    files: files ?? {},
  };
};

/** Fertige Elemente -> PNG (als data-URL, damit sie durch die Playwright-Bridge passt). */
window.elementsToPng = async (elements, files, appState, exportPadding, scale) => {
  const blob = await exportToBlob({
    elements,
    files: files ?? {},
    appState,
    exportPadding,
    getDimensions: (w, h) => ({ width: w * scale, height: h * scale, scale }),
    mimeType: "image/png",
  });
  return blobToDataUrl(blob);
};

window.__ready = true;
