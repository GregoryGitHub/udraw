import { describe, expect, it } from "vitest";

import { InvalidDocumentError, validateDocument } from "./validate";

const minimal = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "udraw",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

describe("validateDocument", () => {
  it("accepts a .udraw file", () => {
    const data = validateDocument(minimal);
    expect(data.type).toBe("excalidraw");
    expect(data.elements).toEqual([]);
  });

  it("accepts an .excalidraw file written by excalidraw.com", () => {
    const fromWeb = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [{ id: "a", type: "rectangle" }],
      appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
      files: {},
    });
    expect(validateDocument(fromWeb).elements).toHaveLength(1);
  });

  it("keeps unknown top-level keys instead of failing on them", () => {
    const withExtra = JSON.stringify({
      type: "excalidraw",
      elements: [],
      somethingNew: { a: 1 },
    });
    expect(() => validateDocument(withExtra)).not.toThrow();
  });

  it.each([
    ["not json at all", "{"],
    ["an array", "[]"],
    ["a library file", JSON.stringify({ type: "excalidrawlib", elements: [] })],
    ["a file without elements", JSON.stringify({ type: "excalidraw" })],
    ["elements that are not a list", JSON.stringify({ type: "excalidraw", elements: {} })],
  ])("rejects %s", (_label, raw) => {
    expect(() => validateDocument(raw)).toThrow(InvalidDocumentError);
  });

  it("names the offending type in the error message", () => {
    expect(() =>
      validateDocument(JSON.stringify({ type: "excalidrawlib", elements: [] })),
    ).toThrow(/excalidrawlib/);
  });
});
