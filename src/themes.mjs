/**
 * Farbschemata für die Diagramme.
 *
 * Bewusst NUR Farben (plus Strichstärke) — die Geometrie kommt komplett von
 * mermaid/dagre. Schriftgrößen werden über `mermaidFontSize` gesteuert, damit
 * mermaid die Knotengrößen passend mitberechnet und nichts überlappt.
 */

export const themes = {
  dark: {
    // Hintergrund der exportierten PNG / des Excalidraw-Canvas
    background: "#0d1117",
    // Knoten
    nodeStroke: "#e6edf3",
    nodeFill: "#1f2937",
    nodeStrokeWidth: 2,
    // Verbindungen
    arrowStroke: "#7dd3fc",
    arrowStrokeWidth: 2,
    // Text
    textColor: "#f0f6fc",
    // an mermaid durchgereicht
    mermaidFontSize: 22,
    excalidrawTheme: "dark",
  },
  light: {
    background: "#ffffff",
    nodeStroke: "#1e293b",
    nodeFill: "#e2e8f0",
    nodeStrokeWidth: 2,
    arrowStroke: "#0369a1",
    arrowStrokeWidth: 2,
    textColor: "#0f172a",
    mermaidFontSize: 22,
    excalidrawTheme: "light",
  },
};

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

/**
 * Färbt die von mermaid-to-excalidraw erzeugten Elemente im gewählten Theme ein.
 * Positionen und Größen bleiben unangetastet.
 */
export function applyTheme(elements, theme) {
  return elements.map((element) => {
    const styled = { ...element };

    if (CONTAINER_TYPES.has(element.type)) {
      styled.strokeColor = theme.nodeStroke;
      styled.backgroundColor = theme.nodeFill;
      styled.fillStyle = "solid";
      styled.strokeWidth = theme.nodeStrokeWidth;
      styled.roughness = 1;
    } else if (element.type === "arrow" || element.type === "line") {
      styled.strokeColor = theme.arrowStroke;
      styled.strokeWidth = theme.arrowStrokeWidth;
      styled.roughness = 1;
    } else if (element.type === "text") {
      styled.strokeColor = theme.textColor;
    }

    return styled;
  });
}
