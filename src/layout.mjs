/**
 * Kreis-Layout für zyklische Diagramme.
 *
 * Warum das nötig ist: mermaid/dagre layoutet hierarchisch. Ein Zyklus
 * A -> B -> C -> A wird dadurch als Reihe mit langem Rückpfeil gezeichnet.
 * Für Loop-Diagramme (Agenten-Loop, ReAct, Feedback-Schleifen) ist der
 * Kreis-Charakter aber die eigentliche Aussage. Dieses Modul nimmt deshalb
 * die fertig vermessenen Knoten und ordnet sie gleichmäßig auf einem Kreis an,
 * die Pfeile werden als Bögen im Uhrzeigersinn neu gezogen.
 *
 * Die Knotengrößen kommen weiterhin von mermaid/Excalidraw — es wird nur
 * vergrößert (auf ein einheitliches Maß), nie verkleinert, damit Text niemals
 * aus seinem Knoten laufen kann.
 */

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

const TAU = Math.PI * 2;

/**
 * @param {object[]} elements  Excalidraw-Elemente aus convertToExcalidrawElements
 * @param {object}   options
 * @param {number}   options.gap        Abstand zwischen Knotenrand und Pfeilanfang (px)
 * @param {number}   options.bow        Wie weit die Pfeilbögen nach außen wölben (0 = gerade)
 * @param {number}   options.startAngle Winkel des ersten Knotens in Grad (-90 = oben)
 */
export function circleLayout(elements, options = {}) {
  const { gap = 26, bow = 0.14, startAngle = -90, spacing = 150 } = options;

  const nodes = elements.filter((element) => CONTAINER_TYPES.has(element.type));
  if (nodes.length < 2) return elements;

  const textById = new Map(
    elements.filter((element) => element.type === "text" && element.containerId).map((t) => [t.containerId, t]),
  );

  const count = nodes.length;

  // Einheitliche Knotengröße: das jeweils größte Maß gewinnt (nur vergrößern).
  const width = Math.max(...nodes.map((n) => n.width));
  const height = Math.max(...nodes.map((n) => n.height));

  // Radius so wählen, dass zwischen zwei benachbarten Knoten nicht nur Platz
  // ist, sondern auch genug Strecke für einen sichtbaren Pfeilbogen dazwischen.
  // Sehnenlänge zwischen zwei Nachbarn = 2 * R * sin(pi / count).
  const needed = Math.max(width, height) + gap * 2.4 + spacing;
  const radius = needed / (2 * Math.sin(Math.PI / count));

  const centerX = radius + width;
  const centerY = radius + height;

  const step = TAU / count;
  const start = (startAngle * Math.PI) / 180;

  const angleOf = (index) => start + index * step;
  const pointAt = (angle, r = radius) => ({
    x: centerX + Math.cos(angle) * r,
    y: centerY + Math.sin(angle) * r,
  });

  const isOutsideNode = (point, nodeCenter) =>
    Math.abs(point.x - nodeCenter.x) > width / 2 + gap ||
    Math.abs(point.y - nodeCenter.y) > height / 2 + gap;

  /**
   * Sucht den Winkel, bei dem der Kreisbogen die (um `gap` vergrößerte)
   * Knoten-Box gerade verlässt. Numerisch statt analytisch, weil so breite und
   * hohe Knoten gleichermaßen korrekt getroffen werden — eine pauschale
   * Winkel-Reserve lässt Pfeile sonst in der Luft hängen.
   */
  const trimAngle = (nodeIndex, direction) => {
    const base = angleOf(nodeIndex);
    const nodeCenter = pointAt(base);
    const increment = (direction * step) / 180;
    for (let taken = 1; taken <= 180; taken += 1) {
      const angle = base + increment * taken;
      if (isOutsideNode(pointAt(angle), nodeCenter)) return angle;
    }
    return base + (direction * step) / 2;
  };

  // --- Knoten (und ihren gebundenen Text) auf den Kreis setzen ---
  const moved = new Map();
  nodes.forEach((node, index) => {
    const center = pointAt(angleOf(index));
    moved.set(node.id, {
      ...node,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    });

    const text = textById.get(node.id);
    if (text) {
      moved.set(text.id, {
        ...text,
        x: center.x - text.width / 2,
        y: center.y - text.height / 2,
        textAlign: "center",
        verticalAlign: "middle",
      });
    }
  });

  // --- Pfeile als Bögen im Uhrzeigersinn neu ziehen ---
  const arrowTemplate = elements.find((element) => element.type === "arrow");
  const arrows = [];

  if (arrowTemplate) {
    for (let index = 0; index < count; index += 1) {
      const from = nodes[index];
      const to = nodes[(index + 1) % count];

      let a0 = trimAngle(index, +1);
      let a1 = trimAngle(index + 1, -1);

      // Schutz gegen entartete Pfeile: wenn die beiden getrimmten Winkel sich
      // überholen, bleibt sonst nur ein Stummel übrig. Dann lieber symmetrisch
      // um die Mitte des Zwischenraums herum ein kurzes Stück zeichnen.
      const spanStart = angleOf(index);
      const spanEnd = angleOf(index + 1);
      if (a1 - a0 < step * 0.15) {
        const middle = (spanStart + spanEnd) / 2;
        a0 = middle - step * 0.12;
        a1 = middle + step * 0.12;
      }

      const tip = pointAt(a0);
      const end = pointAt(a1);
      const mid = pointAt((a0 + a1) / 2, radius * (1 + bow));

      arrows.push({
        ...arrowTemplate,
        id: `loop-arrow-${index}`,
        // Der Klon darf weder den fractional index noch den seed des Templates
        // erben: doppelte Indizes lässt Excalidraw beim Import "reparieren"
        // (Reihenfolge ändert sich), gleiche seeds ergeben identisch
        // gezeichnete Bögen. index weglassen -> Excalidraw vergibt ihn neu.
        index: undefined,
        seed: 1_000_003 + index * 7919,
        versionNonce: 2_000_003 + index * 6421,
        x: tip.x,
        y: tip.y,
        width: Math.abs(end.x - tip.x),
        height: Math.abs(end.y - tip.y),
        points: [
          [0, 0],
          [mid.x - tip.x, mid.y - tip.y],
          [end.x - tip.x, end.y - tip.y],
        ],
        roundness: { type: 2 },
        startArrowhead: null,
        endArrowhead: "arrow",
        // Bindungen an die Knoten, damit sich die Pfeile in excalidraw.com
        // beim Verschieben eines Knotens mitbewegen.
        startBinding: { elementId: from.id, focus: 0, gap },
        endBinding: { elementId: to.id, focus: 0, gap },
        label: undefined,
        boundElements: null,
      });
    }
  }

  const arrowIds = new Set(arrows.map((a) => a.id));

  // Knoten/Text ersetzen, alte Pfeile verwerfen, neue Bögen anhängen.
  const rebuilt = elements
    .filter((element) => element.type !== "arrow")
    .map((element) => moved.get(element.id) ?? element)
    .map((element) =>
      CONTAINER_TYPES.has(element.type)
        ? {
            ...element,
            boundElements: (element.boundElements ?? []).filter(
              (bound) => bound.type === "text" || !arrowIds.has(bound.id),
            ),
          }
        : element,
    );

  return [...rebuilt, ...arrows];
}
