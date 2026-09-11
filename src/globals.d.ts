declare global {
  interface Window {
    /** Where Excalidraw looks for its fonts. We serve them from public/ to stay offline. */
    EXCALIDRAW_ASSET_PATH?: string;
    /** Written into the `source` field of exported .excalidraw/.udraw files. */
    EXCALIDRAW_EXPORT_SOURCE?: string;
  }
}

export {};
