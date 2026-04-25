import { describe, it, expect } from "vitest";
import { internals } from "../useSheetState";
import type { DriveSheetContent } from "../../../../../src/shared/types";

const { applyAction, shouldCoalesce } = internals;

function baseDoc(): DriveSheetContent {
  return {
    kind: "sheet",
    tabs: [
      { id: "t1", name: "Sheet 1", freeze: { row: 1, col: 1 }, rows: [["a", "b"], ["c", "d"]] },
    ],
  };
}

describe("applyAction", () => {
  it("SET_CELL mutates the target cell", () => {
    const next = applyAction(baseDoc(), { type: "SET_CELL", tabId: "t1", row: 0, col: 0, value: "z", at: 0 });
    expect(next.tabs[0].rows[0][0]).toBe("z");
  });

  it("SET_CELL returns the same doc when tab not found", () => {
    const doc = baseDoc();
    const next = applyAction(doc, { type: "SET_CELL", tabId: "missing", row: 0, col: 0, value: "z", at: 0 });
    expect(next).toBe(doc);
  });

  it("INSERT_ROW grows the grid", () => {
    const next = applyAction(baseDoc(), { type: "INSERT_ROW", tabId: "t1", index: 1 });
    expect(next.tabs[0].rows.length).toBe(3);
  });

  it("DELETE_ROW keeps at least one row", () => {
    let next = applyAction(baseDoc(), { type: "DELETE_ROW", tabId: "t1", index: 0 });
    next = applyAction(next, { type: "DELETE_ROW", tabId: "t1", index: 0 });
    expect(next.tabs[0].rows.length).toBe(1);
  });

  it("INSERT_COL and DELETE_COL adjust each row", () => {
    let next = applyAction(baseDoc(), { type: "INSERT_COL", tabId: "t1", index: 1 });
    expect(next.tabs[0].rows[0]).toEqual(["a", "", "b"]);
    next = applyAction(next, { type: "DELETE_COL", tabId: "t1", index: 0 });
    expect(next.tabs[0].rows[0]).toEqual(["", "b"]);
  });

  it("PASTE expands the grid when needed", () => {
    const next = applyAction(baseDoc(), {
      type: "PASTE",
      tabId: "t1",
      startRow: 1,
      startCol: 1,
      values: [["x", "y"], ["z", "w"]],
    });
    expect(next.tabs[0].rows[1]).toEqual(["c", "x", "y"]);
    expect(next.tabs[0].rows[2]).toEqual(["", "z", "w"]);
  });

  it("CLEAR_RANGE empties target cells", () => {
    const next = applyAction(baseDoc(), { type: "CLEAR_RANGE", tabId: "t1", r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(next.tabs[0].rows).toEqual([["", ""], ["", ""]]);
  });

  it("LOAD_CSV replaces rows", () => {
    const next = applyAction(baseDoc(), { type: "LOAD_CSV", tabId: "t1", rows: [["1", "2"], ["3", "4"], ["5", "6"]] });
    expect(next.tabs[0].rows.length).toBe(3);
  });

  it("ADD_TAB appends a new tab", () => {
    const next = applyAction(baseDoc(), { type: "ADD_TAB" });
    expect(next.tabs.length).toBe(2);
  });

  it("RENAME_TAB updates the tab name", () => {
    const next = applyAction(baseDoc(), { type: "RENAME_TAB", tabId: "t1", name: "Budget" });
    expect(next.tabs[0].name).toBe("Budget");
  });

  it("shouldCoalesce returns true for consecutive edits on the same cell within the window", () => {
    const last = { kind: "cell" as const, tabId: "t1", row: 0, col: 0, at: 0 };
    const action = { type: "SET_CELL" as const, tabId: "t1", row: 0, col: 0, value: "b", at: 100 };
    expect(shouldCoalesce(last, action)).toBe(true);
  });

  it("shouldCoalesce returns false for different cells or after the window", () => {
    const last = { kind: "cell" as const, tabId: "t1", row: 0, col: 0, at: 0 };
    expect(shouldCoalesce(last, { type: "SET_CELL", tabId: "t1", row: 0, col: 1, value: "x", at: 50 })).toBe(false);
    expect(shouldCoalesce(last, { type: "SET_CELL", tabId: "t1", row: 0, col: 0, value: "x", at: 9999 })).toBe(false);
  });
});
