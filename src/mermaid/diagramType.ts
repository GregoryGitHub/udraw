/**
 * Diagram types mermaid-to-excalidraw has real converters for. Anything else
 * goes through its GraphImageConverter and lands on the canvas as a single
 * rasterized image element rather than editable shapes.
 */
export const NATIVE_DIAGRAM_KEYWORDS = new Set([
  "graph",
  "flowchart",
  "flowchart-v2",
  "sequenceDiagram",
  "classDiagram",
  "classDiagram-v2",
  "erDiagram",
  "stateDiagram",
  "stateDiagram-v2",
]);

/** Skips `---` frontmatter and `%%` directives to reach the diagram keyword. */
export function detectDiagramType(source: string): string | null {
  const lines = source.split("\n");
  let index = 0;

  if (lines[0]?.trim() === "---") {
    index = 1;
    while (index < lines.length && lines[index].trim() !== "---") {
      index += 1;
    }
    index += 1;
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("%%")) {
      continue;
    }
    return line.split(/[\s:;]/)[0] || null;
  }
  return null;
}

/** True when the diagram will arrive as one image element instead of shapes. */
export function rendersAsImage(source: string): boolean {
  const type = detectDiagramType(source);
  return type !== null && !NATIVE_DIAGRAM_KEYWORDS.has(type);
}
