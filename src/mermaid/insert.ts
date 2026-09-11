import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  getCommonBounds,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import type { MermaidConfig } from "@excalidraw/mermaid-to-excalidraw";
import { nanoid } from "nanoid";

import { detectDiagramType, rendersAsImage } from "./diagramType";
import { appendGroupId, applyTranslation, translationToCenter } from "./placement";

/** Keeps a pathological diagram from locking up the renderer. */
export const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  flowchart: { curve: "linear" },
  themeVariables: { fontSize: "20px" },
  maxEdges: 500,
  maxTextSize: 20000,
};

export type MermaidConversion = {
  elements: OrderedExcalidrawElement[];
  files: BinaryFiles;
  diagramType: string | null;
  rendersAsImage: boolean;
};

export async function convertMermaid(source: string): Promise<MermaidConversion> {
  const { elements: skeletons, files } = await parseMermaidToExcalidraw(
    source,
    MERMAID_CONFIG,
  );
  return {
    // Skeletons carry no ids, bindings or versions - this fills them in.
    elements: convertToExcalidrawElements(skeletons),
    files: files ?? {},
    diagramType: detectDiagramType(source),
    rendersAsImage: rendersAsImage(source),
  };
}

type Viewport = Pick<
  AppState,
  "zoom" | "offsetLeft" | "offsetTop" | "scrollX" | "scrollY" | "width" | "height"
>;

export function centerInViewport(
  elements: readonly OrderedExcalidrawElement[],
  appState: Viewport,
): OrderedExcalidrawElement[] {
  if (!elements.length) {
    return [];
  }
  const center = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );
  const { dx, dy } = translationToCenter(getCommonBounds(elements), center);
  return applyTranslation(elements, dx, dy);
}

/** Text bound to a container is selected through that container, never alone. */
function isBoundText(element: OrderedExcalidrawElement): boolean {
  return element.type === "text" && element.containerId !== null;
}

export type InsertResult = {
  count: number;
  rendersAsImage: boolean;
};

/**
 * Converts and drops the diagram onto the canvas as ordinary elements. The
 * mermaid source is deliberately not kept anywhere: from here on it is just a
 * drawing.
 */
export async function insertMermaidDiagram(
  api: ExcalidrawImperativeAPI,
  source: string,
): Promise<InsertResult> {
  const conversion = await convertMermaid(source);
  if (!conversion.elements.length) {
    throw new Error("O diagrama não gerou nenhum elemento.");
  }

  const groupId = `mermaid_${nanoid(8)}`;
  const placed = appendGroupId(centerInViewport(conversion.elements, api.getAppState()), groupId);

  const files = Object.values(conversion.files);
  if (files.length) {
    api.addFiles(files);
  }

  api.updateScene({
    elements: [...api.getSceneElements(), ...placed],
    // One history entry, so a single undo removes the whole diagram.
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  // Selection has to be a second pass, one macrotask later: Excalidraw
  // normalizes appState against the elements it has already committed, so a
  // selection naming ids from this very update is discarded. Bound text is left
  // out because Excalidraw selects it through its container, never on its own.
  await new Promise((resolve) => setTimeout(resolve, 0));
  api.updateScene({
    appState: {
      selectedElementIds: Object.fromEntries(
        placed
          .filter((element) => !isBoundText(element))
          .map((element) => [element.id, true]),
      ),
      selectedGroupIds: { [groupId]: true },
    },
    // Selecting is not an undoable action.
    captureUpdate: CaptureUpdateAction.NEVER,
  });

  return { count: placed.length, rendersAsImage: conversion.rendersAsImage };
}
