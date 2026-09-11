/**
 * Placement maths for freshly converted diagrams. Structurally typed so it can
 * be unit-tested without booting the Excalidraw runtime.
 */

export type Placeable = {
  x: number;
  y: number;
  groupIds: readonly string[];
};

export type Bounds = readonly [minX: number, minY: number, maxX: number, maxY: number];

export function translationToCenter(
  bounds: Bounds,
  center: { x: number; y: number },
): { dx: number; dy: number } {
  const [minX, minY, maxX, maxY] = bounds;
  return {
    dx: center.x - (minX + maxX) / 2,
    dy: center.y - (minY + maxY) / 2,
  };
}

/**
 * Shifting every element by the same delta is safe: arrow `points` and bound
 * text positions are all relative to their own element's x/y.
 */
export function applyTranslation<T extends Placeable>(
  elements: readonly T[],
  dx: number,
  dy: number,
): T[] {
  return elements.map((element) => ({ ...element, x: element.x + dx, y: element.y + dy }));
}

/**
 * Appends the block's group id last, which makes it the outermost group and
 * leaves any subgraph grouping the converter produced intact underneath.
 */
export function appendGroupId<T extends Placeable>(
  elements: readonly T[],
  groupId: string,
): T[] {
  return elements.map((element) => ({
    ...element,
    groupIds: [...element.groupIds, groupId],
  }));
}
