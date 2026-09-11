import { describe, expect, it } from "vitest";

import { detectDiagramType, rendersAsImage } from "./diagramType";

describe("detectDiagramType", () => {
  it("reads the keyword off the first meaningful line", () => {
    expect(detectDiagramType("flowchart TD\n  A --> B")).toBe("flowchart");
    expect(detectDiagramType("sequenceDiagram\n  A->>B: oi")).toBe("sequenceDiagram");
  });

  it("skips blank lines and %% directives", () => {
    const source = `%%{init: {"theme":"default"} }%%

graph LR
  A --> B`;
    expect(detectDiagramType(source)).toBe("graph");
  });

  it("skips --- frontmatter", () => {
    const source = `---
title: Meu diagrama
config:
  theme: base
---
stateDiagram-v2
  [*] --> A`;
    expect(detectDiagramType(source)).toBe("stateDiagram-v2");
  });

  it("splits the keyword off a trailing direction or colon", () => {
    expect(detectDiagramType("classDiagram-v2\n  class A")).toBe("classDiagram-v2");
    expect(detectDiagramType("erDiagram\n  A ||--o{ B : tem")).toBe("erDiagram");
  });

  it("returns null for an empty source", () => {
    expect(detectDiagramType("")).toBeNull();
    expect(detectDiagramType("\n\n  \n")).toBeNull();
  });
});

describe("rendersAsImage", () => {
  it.each([
    "flowchart TD\n A-->B",
    "graph LR\n A-->B",
    "sequenceDiagram\n A->>B: oi",
    "classDiagram\n class A",
    "erDiagram\n A ||--o{ B : tem",
    "stateDiagram-v2\n [*] --> A",
  ])("keeps natively converted diagrams as shapes: %s", (source) => {
    expect(rendersAsImage(source)).toBe(false);
  });

  it.each([
    "pie title Vendas\n  \"A\" : 10",
    "gantt\n  title Cronograma",
    "mindmap\n  root((ideia))",
    "gitGraph\n  commit",
    "journey\n  title Minha jornada",
    "timeline\n  title História",
  ])("flags diagrams that fall back to an image: %s", (source) => {
    expect(rendersAsImage(source)).toBe(true);
  });

  it("does not flag an empty source", () => {
    expect(rendersAsImage("")).toBe(false);
  });
});
