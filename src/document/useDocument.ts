import { CaptureUpdateAction, getSceneVersion } from "@excalidraw/excalidraw";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

import { backend, OPEN_FILE_EVENT, type Recent } from "./backend";
import {
  DEFAULT_EXTENSION,
  DEFAULT_FILENAME,
  DOCUMENT_EXTENSIONS,
  basename,
  deserializeScene,
  serializeScene,
  withDefaultExtension,
} from "./format";
import { InvalidDocumentError } from "./validate";

const AUTOSAVE_DELAY_MS = 2000;

const FILE_FILTERS = [
  { name: "Desenhos uDraw", extensions: [...DOCUMENT_EXTENSIONS] },
  { name: "Todos os arquivos", extensions: ["*"] },
];

/**
 * Cheap identity of the persisted parts of a scene - drives the dirty flag.
 * Covers exactly the appState fields serializeAsJSON writes to the file, so
 * toggling the grid or the background counts as an unsaved change.
 */
function signature(
  elements: readonly ExcalidrawElement[],
  appState: Pick<AppState, "viewBackgroundColor" | "gridModeEnabled" | "gridSize" | "gridStep">,
): string {
  return [
    getSceneVersion(elements),
    elements.length,
    appState.viewBackgroundColor ?? "",
    appState.gridModeEnabled ? "grid" : "",
    appState.gridSize ?? "",
    appState.gridStep ?? "",
  ].join("|");
}

/**
 * Excalidraw commits scene updates through React state, so the scene a call to
 * updateScene/resetScene produced is only readable one macrotask later. The
 * saved-state baseline has to be taken from the committed scene, otherwise a
 * freshly opened document reports itself as already modified.
 */
const afterCommit = () => new Promise((resolve) => setTimeout(resolve, 0));

type Options = {
  api: ExcalidrawImperativeAPI | null;
  confirmUnsaved: (name: string) => Promise<"save" | "discard" | "cancel">;
  showError: (title: string, message: string) => Promise<void>;
  confirmRecover: (name: string, savedAt: number) => Promise<boolean>;
};

export function useDocument({ api, confirmUnsaved, showError, confirmRecover }: Options) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [recents, setRecents] = useState<Recent[]>([]);

  const savedSignature = useRef<string>("");
  const autosaveTimer = useRef<number | null>(null);
  const filePathRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  filePathRef.current = filePath;
  dirtyRef.current = dirty;

  const documentName = filePath ? basename(filePath) : DEFAULT_FILENAME;
  const documentNameRef = useRef(documentName);
  documentNameRef.current = documentName;

  const markSaved = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      // Drop any pending autosave, or it would rewrite the recovery file moments
      // after the scene was persisted for real.
      if (autosaveTimer.current !== null) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      savedSignature.current = signature(elements, appState);
      setDirty(false);
    },
    [],
  );

  const cancelAutosave = useCallback(() => {
    if (autosaveTimer.current !== null) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }, []);

  /**
   * Fires on every pointer move while drawing, so it must not push React state
   * on each call - `dirty` is a boolean that settles immediately, and the
   * autosave timer is handled imperatively rather than through an effect.
   */
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const isDirty = signature(elements, appState) !== savedSignature.current;
      setDirty(isDirty);
      if (!isDirty) {
        return;
      }
      if (autosaveTimer.current !== null) {
        clearTimeout(autosaveTimer.current);
      }
      autosaveTimer.current = window.setTimeout(() => {
        autosaveTimer.current = null;
        void backend
          .recoveryWrite(serializeScene(elements, appState, files), filePathRef.current)
          .catch(() => undefined);
      }, AUTOSAVE_DELAY_MS);
    },
    [],
  );

  useEffect(() => cancelAutosave, [cancelAutosave]);

  const syncRecents = useCallback(async (next?: Recent[]) => {
    setRecents(next ?? (await backend.listRecents()));
    await backend.refreshMenu().catch(() => undefined);
  }, []);

  const applyScene = useCallback(
    async (restored: RestoredDataState, path: string | null) => {
      if (!api) {
        return;
      }
      api.updateScene({
        elements: restored.elements,
        appState: restored.appState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      const files = Object.values(restored.files ?? {});
      if (files.length) {
        api.addFiles(files);
      }
      // A freshly opened document starts with a clean slate of undo history.
      api.history.clear();
      if (restored.elements.length) {
        api.scrollToContent(restored.elements, { fitToContent: true });
      }
      setFilePath(path);
      filePathRef.current = path;
      await afterCommit();
      markSaved(api.getSceneElements(), api.getAppState());
    },
    [api, markSaved],
  );

  const loadFromPath = useCallback(
    async (path: string) => {
      try {
        const raw = await backend.readDocument(path);
        await applyScene(deserializeScene(raw), path);
        await backend.recoveryClear().catch(() => undefined);
        await syncRecents(await backend.pushRecent(path));
      } catch (error) {
        const message =
          error instanceof InvalidDocumentError ? error.message : String(error);
        await showError("Não foi possível abrir o arquivo", message);
      }
    },
    [applyScene, showError, syncRecents],
  );

  const currentScene = useCallback(() => {
    if (!api) {
      return null;
    }
    return {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    };
  }, [api]);

  const writeTo = useCallback(
    async (path: string) => {
      const scene = currentScene();
      if (!scene) {
        return false;
      }
      try {
        await backend.writeDocument(
          path,
          serializeScene(scene.elements, scene.appState, scene.files),
        );
      } catch (error) {
        await showError("Não foi possível salvar", String(error));
        return false;
      }
      setFilePath(path);
      filePathRef.current = path;
      markSaved(scene.elements, scene.appState);
      await backend.recoveryClear().catch(() => undefined);
      await syncRecents(await backend.pushRecent(path));
      return true;
    },
    [currentScene, markSaved, showError, syncRecents],
  );

  const saveAs = useCallback(async () => {
    const path = await saveDialog({
      title: "Salvar desenho",
      defaultPath: filePathRef.current ?? DEFAULT_FILENAME,
      filters: FILE_FILTERS,
      canCreateDirectories: true,
    });
    if (!path) {
      return false;
    }
    return writeTo(withDefaultExtension(path, DEFAULT_EXTENSION));
  }, [writeTo]);

  const save = useCallback(async () => {
    const path = filePathRef.current;
    return path ? writeTo(path) : saveAs();
  }, [saveAs, writeTo]);

  /** Returns false when the user cancelled out of a destructive transition. */
  const ensureSaved = useCallback(async () => {
    if (!dirtyRef.current) {
      return true;
    }
    const choice = await confirmUnsaved(documentNameRef.current);
    if (choice === "cancel") {
      return false;
    }
    if (choice === "discard") {
      await backend.recoveryClear().catch(() => undefined);
      return true;
    }
    return save();
  }, [confirmUnsaved, save]);

  const newDocument = useCallback(async () => {
    if (!api || !(await ensureSaved())) {
      return;
    }
    api.resetScene();
    api.history.clear();
    setFilePath(null);
    filePathRef.current = null;
    await afterCommit();
    markSaved(api.getSceneElements(), api.getAppState());
    await backend.recoveryClear().catch(() => undefined);
  }, [api, ensureSaved, markSaved]);

  const openDocument = useCallback(
    async (path?: string) => {
      if (!(await ensureSaved())) {
        return;
      }
      let target = path;
      if (!target) {
        const picked = await openDialog({
          title: "Abrir desenho",
          multiple: false,
          directory: false,
          filters: FILE_FILTERS,
        });
        if (typeof picked !== "string") {
          return;
        }
        target = picked;
      }
      await loadFromPath(target);
    },
    [ensureSaved, loadFromPath],
  );

  const clearRecents = useCallback(async () => {
    await backend.clearRecents();
    await syncRecents([]);
  }, [syncRecents]);

  // Actions live in a ref so the window-level listeners below register once
  // while still invoking the latest closures.
  const actionsRef = useRef({ ensureSaved, openDocument });
  actionsRef.current = { ensureSaved, openDocument };

  useEffect(() => {
    getCurrentWindow()
      .setTitle(`${dirty ? "• " : ""}${documentName} — uDraw`)
      .catch(() => undefined);
  }, [dirty, documentName]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const pending = appWindow.onCloseRequested(async (event) => {
      if (!dirtyRef.current) {
        return;
      }
      event.preventDefault();
      if (await actionsRef.current.ensureSaved()) {
        dirtyRef.current = false;
        await backend.recoveryClear().catch(() => undefined);
        await appWindow.destroy();
      }
    });
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);

  // Double-clicking a .udraw file while the app is already running.
  useEffect(() => {
    const pending = listen<string>(OPEN_FILE_EVENT, (event) => {
      void actionsRef.current.openDocument(event.payload);
    });
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);

  const bootstrapped = useRef(false);
  useEffect(() => {
    if (!api || bootstrapped.current) {
      return;
    }
    bootstrapped.current = true;

    void (async () => {
      await syncRecents();

      const startup = await backend.startupFile().catch(() => null);
      if (startup) {
        await loadFromPath(startup);
        return;
      }

      const recovery = await backend.recoveryRead().catch(() => null);
      if (!recovery) {
        return;
      }
      const name = recovery.source_path ? basename(recovery.source_path) : DEFAULT_FILENAME;
      if (!(await confirmRecover(name, recovery.saved_at))) {
        await backend.recoveryClear().catch(() => undefined);
        return;
      }
      try {
        await applyScene(deserializeScene(recovery.contents), recovery.source_path);
        // A recovered draft is by definition unsaved work.
        setDirty(true);
      } catch {
        await showError(
          "Recuperação falhou",
          "O rascunho de recuperação estava corrompido e foi descartado.",
        );
        await backend.recoveryClear().catch(() => undefined);
      }
    })();
  }, [api, applyScene, confirmRecover, loadFromPath, showError, syncRecents]);

  return {
    filePath,
    documentName,
    dirty,
    recents,
    handleChange,
    newDocument,
    openDocument,
    save,
    saveAs,
    clearRecents,
  };
}
