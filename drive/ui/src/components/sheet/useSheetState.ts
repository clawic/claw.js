import { useCallback, useRef, useState } from "react";
import type { DriveSheetContent, DriveSheetTab } from "../../../../src/shared/types";
import { MAX_UNDO, UNDO_COALESCE_MS } from "./constants";

type Tab = DriveSheetTab;

export type SheetAction =
  | { type: "SET_CELL"; tabId: string; row: number; col: number; value: string; at: number }
  | { type: "PASTE"; tabId: string; startRow: number; startCol: number; values: string[][] }
  | { type: "INSERT_ROW"; tabId: string; index: number }
  | { type: "DELETE_ROW"; tabId: string; index: number }
  | { type: "INSERT_COL"; tabId: string; index: number }
  | { type: "DELETE_COL"; tabId: string; index: number }
  | { type: "CLEAR_RANGE"; tabId: string; r1: number; c1: number; r2: number; c2: number }
  | { type: "LOAD_CSV"; tabId: string; rows: string[][] }
  | { type: "ADD_TAB" }
  | { type: "RENAME_TAB"; tabId: string; name: string };

function cloneTabs(tabs: Tab[]): Tab[] {
  return tabs.map((tab) => ({
    ...tab,
    rows: tab.rows.map((row) => [...row]),
    freeze: { ...tab.freeze },
  }));
}

function ensureSize(tab: Tab, row: number, col: number): void {
  const targetRows = Math.max(tab.rows.length, row + 1);
  const widthCandidates = tab.rows.map((r) => r.length);
  widthCandidates.push(col + 1, 1);
  const targetCols = Math.max(...widthCandidates);
  while (tab.rows.length < targetRows) tab.rows.push(new Array(targetCols).fill(""));
  for (const r of tab.rows) {
    while (r.length < targetCols) r.push("");
  }
}

function normalizeTab(tab: Tab): void {
  const width = tab.rows.reduce((max, row) => Math.max(max, row.length), 0) || 1;
  for (const row of tab.rows) {
    while (row.length < width) row.push("");
  }
  if (tab.rows.length === 0) tab.rows.push(new Array(width).fill(""));
}

export function applyAction(doc: DriveSheetContent, action: SheetAction): DriveSheetContent {
  const nextTabs = cloneTabs(doc.tabs);
  const find = (id: string) => nextTabs.find((tab) => tab.id === id);

  switch (action.type) {
    case "SET_CELL": {
      const tab = find(action.tabId); if (!tab) return doc;
      ensureSize(tab, action.row, action.col);
      tab.rows[action.row][action.col] = action.value;
      break;
    }
    case "PASTE": {
      const tab = find(action.tabId); if (!tab) return doc;
      for (let r = 0; r < action.values.length; r += 1) {
        for (let c = 0; c < action.values[r].length; c += 1) {
          ensureSize(tab, action.startRow + r, action.startCol + c);
          tab.rows[action.startRow + r][action.startCol + c] = action.values[r][c];
        }
      }
      break;
    }
    case "INSERT_ROW": {
      const tab = find(action.tabId); if (!tab) return doc;
      const width = tab.rows[0]?.length ?? 1;
      tab.rows.splice(action.index, 0, new Array(width).fill(""));
      break;
    }
    case "DELETE_ROW": {
      const tab = find(action.tabId); if (!tab || tab.rows.length <= 1) return doc;
      tab.rows.splice(action.index, 1);
      break;
    }
    case "INSERT_COL": {
      const tab = find(action.tabId); if (!tab) return doc;
      for (const row of tab.rows) row.splice(action.index, 0, "");
      break;
    }
    case "DELETE_COL": {
      const tab = find(action.tabId); if (!tab) return doc;
      const width = tab.rows[0]?.length ?? 0;
      if (width <= 1) return doc;
      for (const row of tab.rows) row.splice(action.index, 1);
      break;
    }
    case "CLEAR_RANGE": {
      const tab = find(action.tabId); if (!tab) return doc;
      for (let r = action.r1; r <= action.r2; r += 1) {
        for (let c = action.c1; c <= action.c2; c += 1) {
          if (r < 0 || c < 0) continue;
          if (r >= tab.rows.length) continue;
          if (c >= tab.rows[r].length) continue;
          tab.rows[r][c] = "";
        }
      }
      break;
    }
    case "LOAD_CSV": {
      const tab = find(action.tabId); if (!tab) return doc;
      tab.rows = action.rows.length > 0 ? action.rows.map((row) => [...row]) : [[""]];
      normalizeTab(tab);
      break;
    }
    case "ADD_TAB": {
      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nextTabs.push({
        id,
        name: `Sheet ${nextTabs.length + 1}`,
        freeze: { row: 1, col: 1 },
        rows: [["", "", "", ""]],
      });
      break;
    }
    case "RENAME_TAB": {
      const tab = find(action.tabId); if (!tab) return doc;
      tab.name = action.name;
      break;
    }
  }

  return { kind: "sheet", tabs: nextTabs };
}

interface LastMutation {
  kind: "cell";
  tabId: string;
  row: number;
  col: number;
  at: number;
}

function shouldCoalesce(last: LastMutation | null, action: SheetAction): boolean {
  if (!last || action.type !== "SET_CELL") return false;
  if (last.tabId !== action.tabId) return false;
  if (last.row !== action.row || last.col !== action.col) return false;
  return action.at - last.at < UNDO_COALESCE_MS;
}

export interface SheetController {
  past: DriveSheetContent[];
  future: DriveSheetContent[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  apply: (action: SheetAction) => void;
  undo: () => void;
  redo: () => void;
}

export function useSheetState(value: DriveSheetContent, onChange: (next: DriveSheetContent) => void): SheetController {
  const [past, setPast] = useState<DriveSheetContent[]>([]);
  const [future, setFuture] = useState<DriveSheetContent[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(value.tabs[0]?.id ?? "");
  const lastMutationRef = useRef<LastMutation | null>(null);

  const apply = useCallback((action: SheetAction) => {
    const snapshot = value;
    const next = applyAction(value, action);
    if (next === value) return;
    const coalesce = shouldCoalesce(lastMutationRef.current, action);
    if (!coalesce) {
      setPast((prev) => {
        const arr = [...prev, snapshot];
        if (arr.length > MAX_UNDO) arr.shift();
        return arr;
      });
    }
    setFuture([]);
    lastMutationRef.current = action.type === "SET_CELL"
      ? { kind: "cell", tabId: action.tabId, row: action.row, col: action.col, at: action.at }
      : null;
    if (action.type === "ADD_TAB") {
      setActiveTabId(next.tabs[next.tabs.length - 1]?.id ?? activeTabId);
    }
    onChange(next);
  }, [value, onChange, activeTabId]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((prev) => [value, ...prev]);
    lastMutationRef.current = null;
    onChange(previous);
  }, [past, value, onChange]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const [nextValue, ...rest] = future;
    setFuture(rest);
    setPast((prev) => [...prev, value]);
    lastMutationRef.current = null;
    onChange(nextValue);
  }, [future, value, onChange]);

  return { past, future, activeTabId, setActiveTabId, apply, undo, redo };
}

export const internals = { applyAction, shouldCoalesce };
