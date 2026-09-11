import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { GridToggle } from "./canvas/GridToggle";
import { MainMenuBar, type MenuCommand } from "./canvas/MainMenuBar";
import { UDrawCanvas } from "./canvas/UDrawCanvas";
import { MENU_EVENT } from "./document/backend";
import { ExportDialog } from "./document/ExportDialog";
import {
  DEFAULT_EXPORT_OPTIONS,
  copySceneToClipboard,
  exportScene,
  selectedElements,
  type ExportFormat,
  type ExportOptions,
} from "./document/exporters";
import { useDocument } from "./document/useDocument";
import { MermaidPanel } from "./mermaid/MermaidPanel";
import { useDialogs } from "./shell/Dialogs";

const RECENT_PREFIX = "recent:";

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);

  const { dialogs, confirmUnsaved, showError, confirmRecover } = useDialogs();
  const doc = useDocument({ api, confirmUnsaved, showError, confirmRecover });

  // Mirrors Excalidraw's grid state so the button also reflects its own Ctrl+'
  // shortcut. Setting the same boolean is a no-op render in React, and this runs
  // on every pointer move while drawing.
  const onSceneChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      setGridEnabled(appState.gridModeEnabled);
      doc.handleChange(elements, appState, files);
    },
    [doc.handleChange],
  );

  const toggleGrid = useCallback(() => {
    if (!api) {
      return;
    }
    api.updateScene({
      appState: { gridModeEnabled: !api.getAppState().gridModeEnabled },
      // A view toggle should not become an undo step of its own.
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api]);

  const toast = useCallback(
    (message: string) => api?.setToast({ message, duration: 2500 }),
    [api],
  );

  // Dev-only handle so the smoke script (and the devtools console) can inspect
  // and drive the live scene and document state. Stripped from production builds.
  useEffect(() => {
    if (import.meta.env.DEV) {
      const dev = window as unknown as Record<string, unknown>;
      dev.__UDRAW_API__ = api;
      dev.__UDRAW_DOC__ = doc;
    }
  });

  const handleCommand = useCallback(
    async (command: MenuCommand) => {
      switch (command) {
        case "new":
          return doc.newDocument();
        case "open":
          return doc.openDocument();
        case "save": {
          if (await doc.save()) {
            toast("Desenho salvo.");
          }
          return;
        }
        case "save-as": {
          if (await doc.saveAs()) {
            toast("Desenho salvo.");
          }
          return;
        }
        case "export-png":
          setExportFormat("png");
          return;
        case "export-svg":
          setExportFormat("svg");
          return;
        case "copy-png": {
          if (!api) {
            return;
          }
          try {
            await copySceneToClipboard(api, {
              ...DEFAULT_EXPORT_OPTIONS,
              selectionOnly: selectedElements(api).length > 0,
            });
            toast("Imagem copiada.");
          } catch (error) {
            await showError("Não foi possível copiar", String(error));
          }
          return;
        }
        case "insert-mermaid":
          setMermaidOpen(true);
          return;
        case "recent-clear":
          return doc.clearRecents();
      }
    },
    [api, doc, showError, toast],
  );

  // Native menu clicks arrive as an event carrying the item id.
  const commandRef = useRef({ handleCommand, openDocument: doc.openDocument });
  commandRef.current = { handleCommand, openDocument: doc.openDocument };

  useEffect(() => {
    const pending = listen<string>(MENU_EVENT, (event) => {
      const id = event.payload;
      if (id.startsWith(RECENT_PREFIX)) {
        void commandRef.current.openDocument(id.slice(RECENT_PREFIX.length));
        return;
      }
      void commandRef.current.handleCommand(id as MenuCommand);
    });
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);

  const runExport = useCallback(
    async (options: ExportOptions) => {
      setExportFormat(null);
      if (!api) {
        return;
      }
      try {
        const path = await exportScene(
          api,
          options,
          doc.documentName.replace(/\.[^.]+$/, ""),
        );
        if (path) {
          toast(`Exportado para ${path}`);
        }
      } catch (error) {
        await showError("Não foi possível exportar", String(error));
      }
    },
    [api, doc.documentName, showError, toast],
  );

  return (
    <>
      <UDrawCanvas onApiReady={setApi} onChange={onSceneChange}>
        <MainMenuBar
          recents={doc.recents}
          onCommand={(command) => void handleCommand(command)}
          onOpenRecent={(path) => void doc.openDocument(path)}
        />
      </UDrawCanvas>

      {api ? <GridToggle enabled={gridEnabled} onToggle={toggleGrid} /> : null}

      {dialogs}

      {exportFormat && api ? (
        <ExportDialog
          format={exportFormat}
          hasSelection={selectedElements(api).length > 0}
          onCancel={() => setExportFormat(null)}
          onConfirm={(options) => void runExport(options)}
        />
      ) : null}

      {mermaidOpen && api ? (
        <MermaidPanel
          api={api}
          onClose={() => setMermaidOpen(false)}
          onInserted={toast}
        />
      ) : null}
    </>
  );
}
