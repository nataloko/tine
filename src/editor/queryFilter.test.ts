import { describe, expect, it } from "vitest";
import { regroupSurvivors } from "./queryFilter";
import type { BlockDto, RefGroup } from "../types";

function block(id: string): BlockDto {
  return { id, raw: id, children: [] } as unknown as BlockDto;
}
function group(page: string, ids: string[]): RefGroup {
  return { page, kind: "page", blocks: ids.map(block) };
}

describe("regroupSurvivors", () => {
  it("returns the same array identity when every block survives", () => {
    const groups = [group("A", ["a1", "a2"]), group("B", ["b1"])];
    const keep = new Set(["a1", "a2", "b1"]);
    expect(regroupSurvivors(groups, keep)).toBe(groups);
  });

  it("keeps surviving blocks and drops groups left empty, preserving order", () => {
    const groups = [group("A", ["a1", "a2"]), group("B", ["b1"]), group("C", ["c1", "c2"])];
    const keep = new Set(["a2", "c1", "c2"]); // all of B removed; A partially
    const out = regroupSurvivors(groups, keep);

    expect(out.map((g) => g.page)).toEqual(["A", "C"]); // B dropped, order kept
    expect(out[0].blocks.map((b) => b.id)).toEqual(["a2"]);
    expect(out[1].blocks.map((b) => b.id)).toEqual(["c1", "c2"]);
  });

  it("preserves within-group block order (global sort-by case)", () => {
    // A global sort-by returns one block per group; order across groups is the
    // sorted order and must be preserved through filtering.
    const groups = [group("p", ["z"]), group("p", ["m"]), group("p", ["a"])];
    const out = regroupSurvivors(groups, new Set(["z", "a"]));
    expect(out.flatMap((g) => g.blocks.map((b) => b.id))).toEqual(["z", "a"]);
  });

  it("reuses an untouched group's object but rebuilds a trimmed one", () => {
    const groups = [group("A", ["a1", "a2"]), group("B", ["b1", "b2"])];
    const out = regroupSurvivors(groups, new Set(["a1", "a2", "b1"]));
    expect(out[0]).toBe(groups[0]); // A untouched → same object
    expect(out[1]).not.toBe(groups[1]); // B trimmed → new object
    expect(out[1].blocks.map((b) => b.id)).toEqual(["b1"]);
  });

  it("returns an empty array when nothing survives", () => {
    const groups = [group("A", ["a1"]), group("B", ["b1"])];
    expect(regroupSurvivors(groups, new Set())).toEqual([]);
  });
});
