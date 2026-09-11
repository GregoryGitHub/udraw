/**
 * Must be imported before anything pulls in @excalidraw/excalidraw: the package
 * reads these globals while its font stylesheet initializes. Without the asset
 * path it downloads fonts from a CDN, which breaks the app offline.
 */
window.EXCALIDRAW_ASSET_PATH = "/";
window.EXCALIDRAW_EXPORT_SOURCE = "udraw";

export {};
