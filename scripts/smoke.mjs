/**
 * End-to-end smoke test against the running Vite dev server. It drives a real
 * Chromium because the Excalidraw canvas and mermaid both need browser APIs
 * (canvas metrics, getBBox) that jsdom does not provide, which is why the
 * vitest suite only covers the dependency-free logic.
 *
 * App modules are imported through Vite ("/src/...") so the real module graph,
 * interop and code paths are exercised - not a reimplementation of them.
 *
 * Usage: npm run dev (in another shell), then node scripts/smoke.mjs
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] ?? "http://localhost:1420";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const FLOWCHART = ["flowchart TD", "  A[Inicio] --> B{Ok?}", "  B -- Sim --> C[Fim]"].join(
  "\n",
);
const FLOWCHART_2 = ["flowchart LR", "  A[Um] --> B[Dois]", "  B --> C[Tres]"].join("\n");
const PIE = ["pie title Vendas", '  "A" : 40', '  "B" : 60'].join("\n");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
  // Fail fast instead of hanging if a modal is waiting on a click.
  protocolTimeout: 60000,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const requests = [];
  page.on("request", (req) => requests.push(req.url()));

  // Tauri's IPC only exists inside the desktop shell; stub it so the document
  // layer's startup calls resolve instead of throwing.
  await page.evaluateOnNewDocument(() => {
    let callbackId = 0;
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { windowLabel: "main", label: "main" },
      },
      invoke: async (cmd, args) => {
        window.__CALLS__ = window.__CALLS__ ?? [];
        window.__CALLS__.push({ cmd, args });
        if (cmd === "plugin:event|listen") return ++callbackId;
        if (cmd === "list_recents") return [];
        // Pretend the user picked a destination in the native save dialog.
        if (cmd === "plugin:dialog|save") return "C:/tmp/desenho";
        // Serve whatever the test staged as the file being opened.
        if (cmd === "read_document") return window.__READ_CONTENTS__;
        return null;
      },
      transformCallback: (cb) => {
        const id = ++callbackId;
        window[`_${id}`] = cb;
        return id;
      },
      convertFileSrc: (p) => p,
    };
  });

  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

  // 1. The canvas mounts.
  await page.waitForSelector("canvas.excalidraw__canvas", { timeout: 30000 });
  const canvasCount = await page.$$eval("canvas.excalidraw__canvas", (c) => c.length);
  check("Excalidraw canvas monta", canvasCount > 0, `${canvasCount} canvas`);

  // 2. Nothing is fetched from outside the dev server - the offline guarantee.
  const external = requests.filter((u) => !u.startsWith(URL) && !u.startsWith("data:"));
  check("Nenhuma requisicao externa (offline)", external.length === 0, external.join(", "));

  // 3. Fonts come from our own public/fonts, not the CDN.
  const fontRequests = requests.filter((u) => u.includes("/fonts/"));
  check(
    "Fontes servidas localmente",
    fontRequests.length > 0,
    `${fontRequests.length} arquivos`,
  );

  // 4. Saved files will be stamped as ours.
  const exportSource = await page.evaluate(() => window.EXCALIDRAW_EXPORT_SOURCE);
  check("EXCALIDRAW_EXPORT_SOURCE = udraw", exportSource === "udraw", String(exportSource));

  // 5. Mermaid conversion produces native shapes, not an image.
  const flowchart = await page.evaluate(async (source) => {
    const { convertMermaid } = await import("/src/mermaid/insert.ts");
    const { elements, rendersAsImage } = await convertMermaid(source);
    return {
      total: elements.length,
      types: [...new Set(elements.map((e) => e.type))].sort(),
      rendersAsImage,
      hasIds: elements.every((e) => typeof e.id === "string" && e.id.length > 0),
      arrowsBound: elements
        .filter((e) => e.type === "arrow")
        .every((e) => e.startBinding && e.endBinding),
    };
  }, FLOWCHART);
  check(
    "Flowchart vira formas nativas editaveis",
    flowchart.total > 0 && !flowchart.types.includes("image") && !flowchart.rendersAsImage,
    `${flowchart.total} elementos: ${flowchart.types.join(", ")}`,
  );
  check("Elementos convertidos tem id", flowchart.hasIds);
  check("Setas ficam vinculadas aos nos", flowchart.arrowsBound);

  // 6. An unsupported diagram type falls back to a single image element, and the
  //    UI is told so it can warn before inserting.
  const pie = await page.evaluate(async (source) => {
    const { convertMermaid } = await import("/src/mermaid/insert.ts");
    const { elements, files, rendersAsImage } = await convertMermaid(source);
    return {
      types: elements.map((e) => e.type),
      files: Object.keys(files).length,
      rendersAsImage,
    };
  }, PIE);
  check(
    "Diagrama sem conversor cai para imagem e e sinalizado",
    pie.types.length === 1 &&
      pie.types[0] === "image" &&
      pie.files === 1 &&
      pie.rendersAsImage,
    `tipos: ${pie.types.join(", ")}, aviso=${pie.rendersAsImage}`,
  );

  // 7. Inserting into the live scene.
  const inserted = await page.evaluate(async (source) => {
    const { insertMermaidDiagram } = await import("/src/mermaid/insert.ts");
    const api = window.__UDRAW_API__;
    const before = api.getSceneElements().length;
    const result = await insertMermaidDiagram(api, source);
    // getAppState() reads React state, so let the commit land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = api.getSceneElements();
    const blockGroups = new Set(
      after.flatMap((e) => e.groupIds).filter((g) => g.startsWith("mermaid_")),
    );
    return {
      before,
      after: after.length,
      count: result.count,
      blockGroups: blockGroups.size,
      allGrouped: after.every((e) => e.groupIds.some((g) => g.startsWith("mermaid_"))),
      selected: Object.keys(api.getAppState().selectedElementIds).length,
      topLevel: after.filter((e) => !e.containerId).length,
      selectedGroups: Object.keys(api.getAppState().selectedGroupIds).length,
    };
  }, FLOWCHART_2);
  check(
    "Insercao adiciona os elementos na cena",
    inserted.before === 0 && inserted.after === inserted.count && inserted.count > 0,
    `${inserted.before} -> ${inserted.after} elementos`,
  );
  check(
    "Elementos inseridos ficam num unico grupo",
    inserted.blockGroups === 1 && inserted.allGrouped,
    `${inserted.blockGroups} grupo(s)`,
  );
  check(
    "Diagrama inserido ja fica selecionado",
    inserted.selected === inserted.topLevel &&
      inserted.topLevel > 0 &&
      inserted.selectedGroups === 1,
    `${inserted.selected}/${inserted.topLevel} elementos de topo, ${inserted.selectedGroups} grupo`,
  );

  // 8. Round-trip through the real save/load code path, diagram included.
  const roundTrip = await page.evaluate(async () => {
    const { serializeScene, deserializeScene } = await import("/src/document/format.ts");
    const api = window.__UDRAW_API__;
    const elements = api.getSceneElements();
    const first = elements.find((e) => e.type === "rectangle");
    const json = serializeScene(elements, api.getAppState(), api.getFiles());
    const parsed = JSON.parse(json);
    const restored = deserializeScene(json);
    const restoredFirst = restored.elements.find((e) => e.id === first.id);
    return {
      type: parsed.type,
      source: parsed.source,
      hasSelectionInFile: "selectedElementIds" in (parsed.appState ?? {}),
      before: elements.length,
      after: restored.elements.length,
      idKept: !!restoredFirst,
      groupKept: !!restoredFirst?.groupIds.some((g) => g.startsWith("mermaid_")),
      textKept: restored.elements.some((e) => e.type === "text" && e.text === "Um"),
    };
  });
  check(
    "Round-trip .udraw preserva cena, ids e agrupamento",
    roundTrip.type === "excalidraw" &&
      roundTrip.source === "udraw" &&
      roundTrip.before === roundTrip.after &&
      roundTrip.idKept &&
      roundTrip.groupKept &&
      roundTrip.textKept,
    `${roundTrip.before} -> ${roundTrip.after} elementos, source=${roundTrip.source}`,
  );
  check(
    "Estado efemero nao vai para o arquivo",
    !roundTrip.hasSelectionInFile,
    "selectedElementIds ausente do appState salvo",
  );

  // 9. A malformed file is rejected with a readable message, not a crash.
  const rejection = await page.evaluate(async () => {
    const { deserializeScene } = await import("/src/document/format.ts");
    try {
      deserializeScene(JSON.stringify({ type: "excalidrawlib", elements: [] }));
      return null;
    } catch (e) {
      return e.message;
    }
  });
  check("Arquivo invalido e recusado com mensagem", !!rejection, String(rejection));

  // 10. The real export path, with the native save dialog stubbed out. The
  //     bytes the backend would have written are captured from the IPC call.
  const exported = await page.evaluate(async () => {
    const { exportScene } = await import("/src/document/exporters.ts");
    const api = window.__UDRAW_API__;
    window.__CALLS__ = [];

    const pngPath = await exportScene(
      api,
      { format: "png", scale: 2, withBackground: true, selectionOnly: false },
      "diagrama",
    );
    const pngCall = window.__CALLS__.find((c) => c.cmd === "write_binary_document");

    const svgPath = await exportScene(
      api,
      { format: "svg", scale: 1, withBackground: true, selectionOnly: false },
      "diagrama",
    );
    const svgCall = window.__CALLS__.find((c) => c.cmd === "write_document");

    return {
      pngPath,
      svgPath,
      pngBytes: pngCall ? atob(pngCall.args.base64Data).length : 0,
      pngMagic: pngCall ? atob(pngCall.args.base64Data).slice(1, 4) : "",
      svgMarkup: svgCall?.args.contents ?? "",
    };
  });
  check(
    "Exportacao PNG grava um PNG valido",
    exported.pngBytes > 1000 && exported.pngMagic === "PNG",
    `${exported.pngBytes} bytes, assinatura "${exported.pngMagic}"`,
  );
  check(
    "Exportacao SVG grava markup",
    exported.svgMarkup.startsWith("<svg") && exported.svgMarkup.length > 500,
    `${exported.svgMarkup.length} chars`,
  );
  check(
    "Extensao correta e forcada no caminho exportado",
    exported.pngPath === "C:/tmp/desenho.png" && exported.svgPath === "C:/tmp/desenho.svg",
    `${exported.pngPath} / ${exported.svgPath}`,
  );

  // 11. The document flow: save -> edit -> dirty -> open -> clean.
  const flow = await page.evaluate(async () => {
    const settle = () => new Promise((r) => setTimeout(r, 80));
    const doc = () => window.__UDRAW_DOC__;
    const api = window.__UDRAW_API__;
    const steps = {};

    // Save the scene the earlier checks left behind (save dialog is stubbed).
    window.__CALLS__ = [];
    const saved = await doc().save();
    await settle();
    const writeCall = window.__CALLS__.find((c) => c.cmd === "write_document");
    steps.saveReturned = saved;
    steps.savedPath = writeCall?.args.path;
    steps.savedValidJson = (() => {
      try {
        return JSON.parse(writeCall.args.contents).type === "excalidraw";
      } catch {
        return false;
      }
    })();
    steps.cleanAfterSave = doc().dirty === false;

    // An edit marks the document dirty.
    api.updateScene({
      elements: [
        ...api.getSceneElements(),
        { ...api.getSceneElements()[0], id: "edit_probe", x: 999, y: 999, groupIds: [] },
      ],
      captureUpdate: "IMMEDIATELY",
    });
    await settle();
    steps.dirtyAfterEdit = doc().dirty === true;

    // Opening with pending changes must ask first; discard and carry on.
    const twoElements = JSON.parse(writeCall.args.contents);
    twoElements.elements = twoElements.elements.slice(0, 2);
    window.__READ_CONTENTS__ = JSON.stringify(twoElements);

    const opening = doc().openDocument("C:/tmp/outro.udraw");
    await settle();
    const discard = [...document.querySelectorAll(".udraw-dialog__actions button")].find(
      (b) => b.textContent.trim() === "Descartar",
    );
    steps.unsavedGuardShown = !!discard;
    discard?.click();
    await opening;
    await settle();
    steps.openedCount = api.getSceneElements().length;
    steps.cleanAfterOpen = doc().dirty === false;
    steps.documentName = doc().documentName;
    return steps;
  });
  check(
    "Salvar grava JSON valido no caminho escolhido",
    flow.saveReturned && flow.savedPath === "C:/tmp/desenho.udraw" && flow.savedValidJson,
    String(flow.savedPath),
  );
  check("Documento fica limpo depois de salvar", flow.cleanAfterSave);
  check("Uma edicao marca o documento como sujo", flow.dirtyAfterEdit);
  check(
    "Abrir com pendencias pede confirmacao antes",
    flow.unsavedGuardShown,
    "dialogo de alteracoes nao salvas apareceu",
  );
  check(
    "Abrir substitui a cena e o titulo",
    flow.openedCount === 2 && flow.documentName === "outro.udraw",
    `${flow.openedCount} elementos, titulo "${flow.documentName}"`,
  );
  check(
    "Documento recem-aberto nao aparece como modificado",
    flow.cleanAfterOpen,
    "dirty=false apos abrir",
  );

  // 12. Grid toggle: sits in the zoom row, drives the real grid, stays in sync
  //     with Excalidraw's own toggle, and counts as an unsaved change.
  const grid = await page.evaluate(async () => {
    const settle = () => new Promise((r) => setTimeout(r, 120));
    const api = window.__UDRAW_API__;
    const button = document.querySelector(".udraw-grid-toggle button");
    if (!button) return { missing: true };

    const zoom = document.querySelector(".zoom-actions").getBoundingClientRect();
    const box = button.getBoundingClientRect();

    // Start from a known state and a saved document.
    api.updateScene({ appState: { gridModeEnabled: false }, captureUpdate: "NEVER" });
    await settle();
    await window.__UDRAW_DOC__.save();
    await settle();

    button.click();
    await settle();
    const on = {
      state: api.getAppState().gridModeEnabled,
      pressed: button.getAttribute("aria-pressed"),
      dirty: window.__UDRAW_DOC__.dirty,
    };

    button.click();
    await settle();
    const off = {
      state: api.getAppState().gridModeEnabled,
      pressed: button.getAttribute("aria-pressed"),
    };

    // Excalidraw's own grid toggle must be reflected back on the button.
    api.updateScene({ appState: { gridModeEnabled: true }, captureUpdate: "NEVER" });
    await settle();
    const external = document
      .querySelector(".udraw-grid-toggle button")
      .getAttribute("aria-pressed");

    api.updateScene({ appState: { gridModeEnabled: false }, captureUpdate: "NEVER" });
    await settle();

    return {
      sameRow: Math.round(box.top) === Math.round(zoom.top) && box.left > zoom.right,
      sameHeight: Math.round(box.height) === Math.round(zoom.height),
      on,
      off,
      external,
    };
  });
  check(
    "Botao da grade fica na mesma linha do zoom, a direita",
    !grid.missing && grid.sameRow && grid.sameHeight,
    grid.missing ? "botao nao encontrado" : "alinhado com .zoom-actions",
  );
  check(
    "Clique liga a grade",
    grid.on?.state === true && grid.on?.pressed === "true",
    `gridModeEnabled=${grid.on?.state}`,
  );
  check(
    "Clique de novo desliga a grade",
    grid.off?.state === false && grid.off?.pressed === "false",
    `gridModeEnabled=${grid.off?.state}`,
  );
  check(
    "Alternar a grade marca o documento como modificado",
    grid.on?.dirty === true,
    "gridModeEnabled e gravado no arquivo",
  );
  check(
    "Botao acompanha o toggle proprio do Excalidraw",
    grid.external === "true",
    "aria-pressed segue o appState",
  );

  // 13. The Mermaid panel itself, driven through the UI: open it from the menu,
  //     wait for the live preview, insert.
  await page.click(".dropdown-menu-button");
  await page.waitForSelector(".dropdown-menu-item", { timeout: 5000 });
  const opened = await page.evaluate(() => {
    const item = [...document.querySelectorAll(".dropdown-menu-item")].find((el) =>
      el.textContent.includes("Diagrama Mermaid"),
    );
    item?.click();
    return !!item;
  });
  check("Menu tem a entrada de diagrama Mermaid", opened);

  await page.waitForSelector(".udraw-mermaid", { timeout: 5000 });
  await page.waitForSelector(".udraw-mermaid__preview svg", { timeout: 20000 });
  check("Painel Mermaid renderiza o preview ao vivo", true);

  const panelInsert = await page.evaluate(async () => {
    const api = window.__UDRAW_API__;
    const before = api.getSceneElements().length;
    const insert = [...document.querySelectorAll(".udraw-mermaid button")].find(
      (b) => b.textContent.trim() === "Inserir",
    );
    insert.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      before,
      after: api.getSceneElements().length,
      panelClosed: !document.querySelector(".udraw-mermaid"),
    };
  });
  check(
    "Botao Inserir do painel adiciona o diagrama e fecha",
    panelInsert.after > panelInsert.before && panelInsert.panelClosed,
    `${panelInsert.before} -> ${panelInsert.after} elementos`,
  );

  // 14. No uncaught errors along the way.
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("__TAURI") && !e.includes("Failed to load resource"),
  );
  check("Sem erros de runtime", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificacoes passaram`);
process.exit(failed.length ? 1 : 0);
