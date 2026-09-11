import { invoke } from "@tauri-apps/api/core";

export type Recent = { path: string; name: string; opened_at: number };
export type RecoveryEntry = {
  contents: string;
  source_path: string | null;
  saved_at: number;
};

/** Tauri maps camelCase JS arguments onto the snake_case Rust parameters. */
export const backend = {
  readDocument: (path: string) => invoke<string>("read_document", { path }),
  writeDocument: (path: string, contents: string) =>
    invoke<void>("write_document", { path, contents }),
  pathExists: (path: string) => invoke<boolean>("path_exists", { path }),
  /** PNG bytes travel base64-encoded; a raw byte array would crawl through the IPC. */
  writeBinaryDocument: (path: string, base64Data: string) =>
    invoke<void>("write_binary_document", { path, base64Data }),

  startupFile: () => invoke<string | null>("startup_file"),
  refreshMenu: () => invoke<void>("refresh_menu"),

  listRecents: () => invoke<Recent[]>("list_recents"),
  pushRecent: (path: string) => invoke<Recent[]>("push_recent", { path }),
  clearRecents: () => invoke<void>("clear_recents"),

  recoveryWrite: (contents: string, sourcePath: string | null) =>
    invoke<void>("recovery_write", { contents, sourcePath }),
  recoveryRead: () => invoke<RecoveryEntry | null>("recovery_read"),
  recoveryClear: () => invoke<void>("recovery_clear"),
};

export const MENU_EVENT = "udraw://menu";
export const OPEN_FILE_EVENT = "udraw://open-file";
