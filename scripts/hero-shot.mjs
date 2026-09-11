/**
 * One-off script: builds a small representative scene (some hand-drawn shapes
 * plus a real Mermaid flowchart, grid on) and screenshots the whole window for
 * the README. Not part of the test suite - run manually when the UI changes
 * enough to be worth a fresh screenshot.
 */
import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? "docs/screenshot.png";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox"],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => {
  let i = 0;
  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    invoke: async (c) => (c === "plugin:event|listen" ? ++i : c === "list_recents" ? [] : null),
    transformCallback: (cb) => {
      const id = ++i;
      window[`_${id}`] = cb;
      return id;
    },
    convertFileSrc: (p) => p,
  };
});
await page.goto("http://localhost:1420", { waitUntil: "networkidle0" });
await page.waitForSelector("canvas.excalidraw__canvas");
await new Promise((r) => setTimeout(r, 400));

await page.evaluate(async () => {
  const { convertToExcalidrawElements, CaptureUpdateAction } = await import(
    "/scripts/hero-helpers.mjs"
  );
  const { insertMermaidDiagram } = await import("/src/mermaid/insert.ts");
  const api = window.__UDRAW_API__;

  const scene = convertToExcalidrawElements([
    {
      // A bound label (rather than a free-floating text element placed by
      // hand) is centered and sized by Excalidraw itself, the same way the
      // Mermaid converter builds its boxes - safer than guessing text width.
      type: "rectangle",
      x: 90,
      y: 120,
      width: 220,
      height: 120,
      strokeColor: "#1e1e1e",
      backgroundColor: "#a5d8ff",
      fillStyle: "hachure",
      roundness: { type: 3 },
      label: { text: "Notas da reunião", fontSize: 20 },
    },
    {
      type: "ellipse",
      x: 90,
      y: 320,
      width: 160,
      height: 100,
      strokeColor: "#e8590c",
      backgroundColor: "#ffd8a8",
      fillStyle: "cross-hatch",
    },
    // No freedraw here on purpose: convertToExcalidrawElements does not build
    // a usable freedraw skeleton (groupIds and width/height come back
    // undefined, version comes back null), which crashes Excalidraw's own
    // group-selection rendering and turns getCommonBounds/fitToContent into
    // NaN. Freedraw is only ever meant to come from real pointer input, so
    // the skeleton path for it isn't hardened - not worth routing around for
    // a decorative squiggle.
  ]);

  api.updateScene({
    elements: [...api.getSceneElements(), ...scene],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  await insertMermaidDiagram(
    api,
    [
      "flowchart TD",
      "  A[Ideia] --> B{Vale a pena?}",
      "  B -- Sim --> C[Prototipar]",
      "  B -- Nao --> D[Arquivar]",
      "  C --> E[Desenhar no uDraw]",
    ].join("\n"),
  );

  // insertMermaidDiagram leaves its group selected; clear that and make sure
  // the selection tool (rather than whatever tool was last active) is what
  // drives the properties panel, so the screenshot shows neither selection
  // handles nor an open style panel.
  api.setActiveTool({ type: "selection" });
  api.updateScene({
    appState: {
      gridModeEnabled: true,
      selectedElementIds: {},
      selectedGroupIds: {},
    },
    captureUpdate: "never",
  });
  api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: false });
});

await new Promise((r) => setTimeout(r, 500));

await page.screenshot({ path: out });
console.log("wrote", out);
await browser.close();
