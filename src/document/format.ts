import { restore, serializeAsJSON } from "@excalidraw/excalidraw";
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

  // `restore` migrates older schema versions and repairs dangling arrow bindings.
  return restore(
    {
      elements: data.elements as RestoredDataState["elements"],
      appState: data.appState as RestoredDataState["appState"],
      files: data.files as BinaryFiles,
    },
    null,
    null,
    { repairBindings: true },
  );
}
