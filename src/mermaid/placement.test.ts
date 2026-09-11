import { describe, expect, it } from "vitest";

import {
  appendGroupId,
  applyTranslation,
  translationToCenter,
  type Placeable,
} from "./placement";

const element = (x: number, y: number, groupIds: string[] = []): Placeable => ({
  x,
  y,
  groupIds,
});

describe("translationToCenter", () => {
  it("moves the bounding box centre onto the target point", () => {
    const { dx, dy } = translationToCenter([0, 0, 100, 50], { x: 500, y: 300 });
    expect(dx).toBe(450);
    expect(dy).toBe(275);
  });

  it("handles bounds that start at negative coordinates", () => {
    const { dx, dy } = translationToCenter([-100, -40, 100, 40], { x: 0, y: 0 });
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });
});

describe("applyTranslation", () => {
  it("shifts every element by the same delta", () => {
    const moved = applyTranslation([element(0, 0), element(30, 10)], 5, -5);
    expect(moved).toEqual([
      { x: 5, y: -5, groupIds: [] },
      { x: 35, y: 5, groupIds: [] },
    ]);
  });

  it("does not mutate the input", () => {
    const original = element(0, 0);
    applyTranslation([original], 10, 10);
    expect(original.x).toBe(0);
  });
});

describe("appendGroupId", () => {
  it("adds the block group as the outermost group", () => {
    const [result] = appendGroupId([element(0, 0, ["subgraph_group_a"])], "mermaid_1");
    // groupIds run innermost -> outermost, so the block id belongs last.
    expect(result.groupIds).toEqual(["subgraph_group_a", "mermaid_1"]);
  });

  it("groups elements that had no grouping of their own", () => {
    const [result] = appendGroupId([element(0, 0)], "mermaid_1");
    expect(result.groupIds).toEqual(["mermaid_1"]);
  });

  it("does not mutate the input", () => {
    const original = element(0, 0, ["a"]);
    appendGroupId([original], "mermaid_1");
    expect(original.groupIds).toEqual(["a"]);
  });
});

describe("placement pipeline", () => {
  it("centres and groups in one pass, leaving relative layout intact", () => {
    const elements = [element(0, 0), element(100, 60)];
    const { dx, dy } = translationToCenter([0, 0, 140, 90], { x: 400, y: 400 });
    const placed = appendGroupId(applyTranslation(elements, dx, dy), "mermaid_x");

    expect(placed[1].x - placed[0].x).toBe(100);
    expect(placed[1].y - placed[0].y).toBe(60);
    expect(placed.every((e) => e.groupIds.includes("mermaid_x"))).toBe(true);
  });
});
