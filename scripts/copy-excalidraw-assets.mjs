/**
 * Copies Excalidraw's bundled fonts into public/ so the app never reaches for the
 * CDN. Excalidraw resolves fonts against window.EXCALIDRAW_ASSET_PATH (we set "/"),
 * so they have to be served from public/fonts.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const target = resolve(root, "public/fonts");

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(source))) {
  console.warn(
    `[udraw] Excalidraw fonts not found at ${source} — skipping copy. ` +
      `Run npm install first; the app will fall back to the CDN and break offline.`,
  );
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
console.log(`[udraw] Copied Excalidraw fonts to public/fonts`);
