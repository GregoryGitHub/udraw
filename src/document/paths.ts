/** Path and extension helpers, kept free of the Excalidraw runtime so they stay unit-testable. */

/** Native extension first; .excalidraw is the same JSON under a different name. */
export const DOCUMENT_EXTENSIONS = ["udraw", "excalidraw"] as const;
export const DEFAULT_EXTENSION = "udraw";
export const DEFAULT_FILENAME = `Sem título.${DEFAULT_EXTENSION}`;

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function extensionOf(path: string): string | null {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

export function hasDocumentExtension(path: string): boolean {
  const ext = extensionOf(path);
  return !!ext && (DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

export function stripExtension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Forces a specific extension - used for exports, where a .png really has to be
 * named .png.
 */
export function forceExtension(path: string, extension: string): string {
  return extensionOf(path) === extension.toLowerCase() ? path : `${path}.${extension}`;
}

/**
 * Fills in an extension only when the user typed none, so saving as
 * "diagrama.excalidraw" is respected.
 */
export function withDefaultExtension(path: string, extension: string): string {
  return extensionOf(path) ? path : `${path}.${extension}`;
}
