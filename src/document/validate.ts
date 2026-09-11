/** Document shape checks, free of the Excalidraw runtime so they stay unit-testable. */

export class InvalidDocumentError extends Error {}

export type DocumentPayload = {
  type: "excalidraw";
  version?: number;
  source?: string;
  elements: unknown[];
  appState?: unknown;
  files?: unknown;
};

/**
 * Parses and sanity-checks a .udraw/.excalidraw file. Deeper migrations are left
 * to Excalidraw's own `restore`, which understands every historical schema.
 */
export function validateDocument(raw: string): DocumentPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidDocumentError("O arquivo não é um JSON válido.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InvalidDocumentError("O arquivo não contém um desenho.");
  }

  const data = parsed as Record<string, unknown>;
  if (data.type !== "excalidraw") {
    throw new InvalidDocumentError(
      `Tipo de arquivo inesperado: ${String(data.type ?? "desconhecido")}.`,
    );
  }
  if (!Array.isArray(data.elements)) {
    throw new InvalidDocumentError("O arquivo não contém uma lista de elementos.");
  }

  return data as DocumentPayload;
}
