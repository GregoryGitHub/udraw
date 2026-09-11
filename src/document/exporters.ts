import { exportToBlob, exportToClipboard, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, NonDeleted } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import { backend } from "./backend";
import { forceExtension } from "./paths";

export type ExportFormat = "png" | "svg";

export type ExportOptions = {
  format: ExportFormat;
  /** 1x, 2x or 3x - only meaningful for the raster export. */
  scale: number;
  withBackground: boolean;
  selectionOnly: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, "format"> = {
  scale: 2,
  withBackground: true,
  selectionOnly: false,
};

export function selectedElements(
  api: ExcalidrawImperativeAPI,
): readonly NonDeleted<ExcalidrawElement>[] {
  const selectedIds = api.getAppState().selectedElementIds;
  return api.getSceneElements().filter((element) => selectedIds[element.id]);
}

function sceneFor(api: ExcalidrawImperativeAPI, selectionOnly: boolean) {
  const all = api.getSceneElements();
  const selection = selectionOnly ? selectedElements(api) : [];
  return selection.length ? selection : all;
}

function exportAppState(api: ExcalidrawImperativeAPI, options: Omit<ExportOptions, "format">) {
  return {
    ...api.getAppState(),
    exportBackground: options.withBackground,
    exportScale: options.scale,
    exportEmbedScene: false,
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * Returns the written path, or null when the user dismissed the save dialog.
 * Throws with a readable message when the export or the write itself fails.
 */
export async function exportScene(
  api: ExcalidrawImperativeAPI,
  options: ExportOptions,
  defaultName: string,
): Promise<string | null> {
  const elements = sceneFor(api, options.selectionOnly);
  if (!elements.length) {
    throw new Error("Não há nada para exportar.");
  }

  const path = await saveDialog({
    title: options.format === "png" ? "Exportar PNG" : "Exportar SVG",
    defaultPath: `${defaultName}.${options.format}`,
    filters: [
      {
        name: options.format === "png" ? "Imagem PNG" : "Imagem SVG",
        extensions: [options.format],
      },
    ],
    canCreateDirectories: true,
  });
  if (!path) {
    return null;
  }

  const target = forceExtension(path, options.format);
  const appState = exportAppState(api, options);
  const files = api.getFiles();

  if (options.format === "png") {
    const blob = await exportToBlob({
      elements,
      appState,
      files,
      mimeType: "image/png",
    });
    await backend.writeBinaryDocument(target, await blobToBase64(blob));
  } else {
    const svg = await exportToSvg({ elements, appState, files });
    await backend.writeDocument(target, new XMLSerializer().serializeToString(svg));
  }

  return target;
}

export async function copySceneToClipboard(
  api: ExcalidrawImperativeAPI,
  options: Omit<ExportOptions, "format"> = DEFAULT_EXPORT_OPTIONS,
): Promise<void> {
  const elements = sceneFor(api, options.selectionOnly);
  if (!elements.length) {
    throw new Error("Não há nada para copiar.");
  }
  await exportToClipboard({
    elements,
    appState: exportAppState(api, options),
    files: api.getFiles(),
    type: "png",
  });
}
