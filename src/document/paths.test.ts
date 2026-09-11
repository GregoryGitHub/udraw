import { describe, expect, it } from "vitest";

import {
  basename,
  extensionOf,
  forceExtension,
  hasDocumentExtension,
  stripExtension,
  withDefaultExtension,
} from "./paths";

describe("basename", () => {
  it("handles Windows and POSIX separators", () => {
    expect(basename("C:\\Users\\ana\\Desenhos\\plano.udraw")).toBe("plano.udraw");
    expect(basename("/home/ana/plano.udraw")).toBe("plano.udraw");
    expect(basename("plano.udraw")).toBe("plano.udraw");
  });
});

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("C:\\x\\PLANO.UDRAW")).toBe("udraw");
  });

  it("returns null when there is no extension", () => {
    expect(extensionOf("C:\\x\\plano")).toBeNull();
  });

  it("does not treat a dotfile as an extension", () => {
    expect(extensionOf("/home/ana/.udraw")).toBeNull();
  });

  it("ignores dots in parent directories", () => {
    expect(extensionOf("C:\\v1.2\\plano")).toBeNull();
  });
});

describe("hasDocumentExtension", () => {
  it("accepts both document extensions", () => {
    expect(hasDocumentExtension("a.udraw")).toBe(true);
    expect(hasDocumentExtension("a.excalidraw")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(hasDocumentExtension("a.png")).toBe(false);
    expect(hasDocumentExtension("a")).toBe(false);
  });
});

describe("withDefaultExtension", () => {
  it("fills in the extension only when the user typed none", () => {
    expect(withDefaultExtension("C:\\x\\plano", "udraw")).toBe("C:\\x\\plano.udraw");
  });

  it("respects an extension the user chose deliberately", () => {
    expect(withDefaultExtension("C:\\x\\plano.excalidraw", "udraw")).toBe(
      "C:\\x\\plano.excalidraw",
    );
  });
});

describe("forceExtension", () => {
  it("appends the export extension when it is missing", () => {
    expect(forceExtension("C:\\x\\diagrama", "png")).toBe("C:\\x\\diagrama.png");
  });

  it("is case-insensitive about an extension already present", () => {
    expect(forceExtension("C:\\x\\diagrama.PNG", "png")).toBe("C:\\x\\diagrama.PNG");
  });

  it("keeps a different extension as part of the name", () => {
    // "relatorio.v2" + svg -> "relatorio.v2.svg", never "relatorio.svg".
    expect(forceExtension("C:\\x\\relatorio.v2", "svg")).toBe("C:\\x\\relatorio.v2.svg");
  });
});

describe("stripExtension", () => {
  it("produces the default name for an export", () => {
    expect(stripExtension("C:\\x\\plano de fundo.udraw")).toBe("plano de fundo");
    expect(stripExtension("plano")).toBe("plano");
  });
});
