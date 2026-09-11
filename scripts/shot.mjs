/**
 * Screenshot helper for eyeballing the UI while developing.
 * Usage: node scripts/shot.mjs out.png [zoomRegionSelector]
 */
import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? "shot.png";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox"],
  protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
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
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out });
console.log("wrote", out);

// Report where the bottom-left controls actually live, to place things next to them.
const boxes = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  return [
    pick(".zoom-actions"),
    pick(".undo-redo-buttons"),
    pick(".App-bottom-bar"),
    pick(".footer-center"),
    pick("footer"),
    pick(".layer-ui__wrapper__footer-left"),
    pick(".layer-ui__wrapper__footer-center"),
    pick(".udraw-grid-toggle"),
  ].filter(Boolean);
});
console.log(JSON.stringify(boxes, null, 2));
await browser.close();
