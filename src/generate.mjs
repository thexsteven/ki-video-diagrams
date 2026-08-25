#!/usr/bin/env node
/**
 * ki-video-diagrams — Mermaid (.mmd) -> .excalidraw + PNG-Vorschau.
 *
 * Beispiel:
 *   npm run generate -- --input diagrams/reason-act-observe.mmd \
 *                       --out output/reason-act-observe
 */
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { themes, applyTheme } from "./themes.mjs";
import { circleLayout } from "./layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { theme: "dark", scale: 2, padding: 40, layout: "mermaid" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    switch (key) {
      case "--input":
        args.input = value;
        i += 1;
        break;
      case "--out":
        args.out = value;
        i += 1;
        break;
      case "--theme":
        args.theme = value;
        i += 1;
        break;
      case "--scale":
        args.scale = Number(value);
        i += 1;
        break;
      case "--padding":
        args.padding = Number(value);
        i += 1;
        break;
      case "--font-size":
        args.fontSize = Number(value);
        i += 1;
        break;
      case "--layout":
        args.layout = value;
        i += 1;
        break;
      case "--bow":
        args.bow = Number(value);
        i += 1;
        break;
      default:
        throw new Error(`Unbekannte Option: ${key}`);
    }
  }
  if (!args.input || !args.out) {
    throw new Error(
      "Benötigt: --input <datei.mmd> --out <pfad/ohne-endung>\n" +
        "Optional: --theme dark|light  --layout mermaid|circle  --scale <n>\n" +
        "          --padding <n>  --font-size <n>  --bow <0..0.5>",
    );
  }
  if (!themes[args.theme]) {
    throw new Error(`Unbekanntes Theme "${args.theme}". Verfügbar: ${Object.keys(themes).join(", ")}`);
  }
  return args;
}

async function ensureBundle() {
  const bundle = path.join(ROOT, "build", "converter.bundle.js");
  try {
    await fs.access(bundle);
  } catch {
    throw new Error('Bundle fehlt. Bitte zuerst "npm run build" ausführen.');
  }
  // page.html liegt neben dem Bundle, damit der relative <script>-Pfad stimmt.
  await fs.copyFile(path.join(ROOT, "src", "page.html"), path.join(ROOT, "build", "page.html"));
  return path.join(ROOT, "build", "page.html");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const theme = { ...themes[args.theme] };
  if (Number.isFinite(args.fontSize)) theme.mermaidFontSize = args.fontSize;

  const definition = await fs.readFile(path.resolve(ROOT, args.input), "utf8");
  const pageFile = await ensureBundle();

  // Normalerweise reicht der von `npx playwright install` gelieferte Browser.
  // CHROMIUM_PATH erlaubt es, ein bereits vorhandenes Chromium zu nutzen
  // (z.B. in CI-/Container-Umgebungen mit vorinstalliertem Browser).
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    page.on("pageerror", (error) => console.error("[browser]", error.message));
    await page.goto(pathToFileURL(pageFile).href);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });

    // 1) GENERATE — Layout von mermaid berechnen lassen
    const raw = await page.evaluate(
      ([def, fontSize]) =>
        window.mermaidToElements(def, {
          themeVariables: { fontSize: `${fontSize}px` },
          // htmlLabels:true (mermaid-Default) ist wichtig: nur so misst mermaid
          // die Knotengröße mit echten <br/>-Zeilenumbrüchen. Den Umbruch im
          // Text selbst setzt normalizeLineBreaks() im Browser-Bundle.
          flowchart: { htmlLabels: true },
        }),
      [definition, theme.mermaidFontSize],
    );

    // 1b) Optional: Zyklus als echten Kreis anordnen statt als dagre-Reihe
    const laidOut =
      args.layout === "circle"
        ? circleLayout(raw.elements, Number.isFinite(args.bow) ? { bow: args.bow } : {})
        : raw.elements;

    const elements = applyTheme(laidOut, theme);

    const appState = {
      viewBackgroundColor: theme.background,
      exportBackground: true,
      // Bewusst false: die Elemente sind über applyTheme() bereits dunkel
      // eingefärbt. exportWithDarkMode würde einen Invert-Filter darüberlegen
      // und alles wieder aufhellen.
      exportWithDarkMode: false,
      theme: theme.excalidrawTheme,
      gridSize: null,
    };

    // 2) Excalidraw-Datei schreiben (importierbar auf excalidraw.com)
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "https://github.com/thexsteven/ki-video-diagrams",
      elements,
      appState,
      files: raw.files,
    };

    const outBase = path.resolve(ROOT, args.out);
    await fs.mkdir(path.dirname(outBase), { recursive: true });
    await fs.writeFile(`${outBase}.excalidraw`, `${JSON.stringify(scene, null, 2)}\n`);

    // 3) OBSERVE — PNG-Vorschau rendern
    const dataUrl = await page.evaluate(
      ([els, files, state, padding, scale]) => window.elementsToPng(els, files, state, padding, scale),
      [elements, raw.files, appState, args.padding, args.scale],
    );
    const png = Buffer.from(dataUrl.split(",")[1], "base64");
    await fs.writeFile(`${outBase}.png`, png);

    const nodes = elements.filter((e) => e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond");
    const arrows = elements.filter((e) => e.type === "arrow");
    console.log(`OK  ${path.relative(ROOT, outBase)}.excalidraw`);
    console.log(`OK  ${path.relative(ROOT, outBase)}.png`);
    console.log(`    ${nodes.length} Knoten, ${arrows.length} Pfeile, Theme "${args.theme}"`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}\n`);
  process.exit(1);
});
