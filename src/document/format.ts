import { restoreAppState, restoreElements, serializeAsJSON } from "@excalidraw/excalidraw";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import { validateDocument } from "./validate";

export * from "./paths";

/**
 * `serializeAsJSON` already strips ephemeral appState (selection, collaborators,
 * cursor state) and keeps only files actually referenced by elements, so there is
 * nothing extra to filter here. `source` comes out as "udraw" because
 * canvas/assets.ts sets window.EXCALIDRAW_EXPORT_SOURCE before the package loads.
 */
export function serializeScene(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): string {
  return serializeAsJSON(elements, appState, files, "local");
}

export function deserializeScene(raw: string): RestoredDataState {
  const data = validateDocument(raw);

  // The combined `restore()` convenience function was dropped from the
  // package; this is its equivalent, built from the two functions it used to
  // wrap. `restoreElements` migrates older schema versions and (with
  // repairBindings) fixes dangling arrow bindings; `restoreAppState` fills in
  // defaults for anything missing. `files` needs no restoration - it is an
  // opaque id-to-blob map, passed straight through both before and after.
  return {
    elements: restoreElements(
      data.elements as RestoredDataState["elements"],
      null,
      { repairBindings: true },
    ),
    appState: restoreAppState(data.appState as RestoredDataState["appState"], null),
    files: (data.files as BinaryFiles) ?? {},
  };
}
