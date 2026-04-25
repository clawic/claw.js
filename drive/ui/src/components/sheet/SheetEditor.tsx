import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent,
  type ChangeEvent,
  type ReactElement,
} from "react";
import {
  Plus,
  Minus,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Undo2,
  Redo2,
  Download,
  Upload,
  Save,
  Trash2,
} from "lucide-react";
import type { DriveSheetContent } from "../../../../src/shared/types";
import { useSheetState } from "./useSheetState";
import { evaluateTab } from "./formula/engine";
import { indexToColLetter, formatRef } from "./formula/a1";
import { parseCsv, toCsv } from "./csv";
import { serializeSelection, parsePasteText, writeClipboard, readClipboard } from "./clipboard";
import {
  DEFAULT_COL_WIDTH,
  MIN_COL_WIDTH,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
  DRAFT_DEBOUNCE_MS,
  DRAFT_STORAGE_PREFIX,
} from "./constants";
import "./SheetEditor.css";

export interface SheetEditorProps {
  value: DriveSheetContent;
  onChange: (next: DriveSheetContent) => void;
  onSave: () => void;
  onExportCsv?: () => void;
  draftKey?: string;
  readOnly?: boolean;
}

interface Coord { row: number; col: number; }

type EditMode = "idle" | "editing";

interface Selection {
  mode: EditMode;
  active: Coord;
  anchor: Coord;
  focus: Coord;
}

interface ContextMenu {
  x: number;
  y: number;
  target: "cell" | "col" | "row";
  index: number;
}

export default function SheetEditor(props: SheetEditorProps): ReactElement {
  const { value, onChange, onSave, onExportCsv, draftKey, readOnly } = props;
  const controller = useSheetState(value, onChange);

  const activeTab = useMemo(
    () => value.tabs.find((tab) => tab.id === controller.activeTabId) ?? value.tabs[0],
    [value.tabs, controller.activeTabId],
  );

  const [selection, setSelection] = useState<Selection>(() => ({
    mode: "idle",
    active: { row: 0, col: 0 },
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  }));
  const [editValue, setEditValue] = useState<string | null>(null);
  const [columnWidthsByTab, setColumnWidthsByTab] = useState<Record<string, number[]>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const dragStateRef = useRef<{ active: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());

  const rows = activeTab?.rows ?? [[""]];
  const height = rows.length;
  const width = rows[0]?.length ?? 1;

  const evaluated = useMemo(() => evaluateTab(rows), [rows]);

  const columnWidths = useMemo(() => {
    const existing = columnWidthsByTab[activeTab?.id ?? ""];
    if (existing && existing.length === width) return existing;
    return new Array(width).fill(DEFAULT_COL_WIDTH);
  }, [columnWidthsByTab, activeTab?.id, width]);

  const setColumnWidth = useCallback((index: number, nextWidth: number) => {
    if (!activeTab) return;
    setColumnWidthsByTab((prev) => {
      const current = prev[activeTab.id] ?? new Array(width).fill(DEFAULT_COL_WIDTH);
      const next = [...current];
      while (next.length < width) next.push(DEFAULT_COL_WIDTH);
      next[index] = Math.max(MIN_COL_WIDTH, nextWidth);
      return { ...prev, [activeTab.id]: next };
    });
  }, [activeTab, width]);

  useEffect(() => {
    if (!draftKey) return;
    const handle = setTimeout(() => {
      try {
        sessionStorage.setItem(`${DRAFT_STORAGE_PREFIX}${draftKey}`, JSON.stringify(value.tabs));
      } catch { /* ignore quota */ }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [draftKey, value.tabs]);

  const rangeRect = useMemo(() => {
    return {
      r1: Math.min(selection.anchor.row, selection.focus.row),
      r2: Math.max(selection.anchor.row, selection.focus.row),
      c1: Math.min(selection.anchor.col, selection.focus.col),
      c2: Math.max(selection.anchor.col, selection.focus.col),
    };
  }, [selection]);

  const commitEdit = useCallback((nextValue: string | null) => {
    if (!activeTab) return;
    if (nextValue === null) {
      setEditValue(null);
      setSelection((prev) => ({ ...prev, mode: "idle" }));
      return;
    }
    controller.apply({
      type: "SET_CELL",
      tabId: activeTab.id,
      row: selection.active.row,
      col: selection.active.col,
      value: nextValue,
      at: Date.now(),
    });
    setEditValue(null);
    setSelection((prev) => ({ ...prev, mode: "idle" }));
  }, [activeTab, controller, selection.active]);

  const moveActive = useCallback((rowDelta: number, colDelta: number, extend = false) => {
    setSelection((prev) => {
      const next = {
        row: Math.max(0, Math.min(height - 1, prev.active.row + rowDelta)),
        col: Math.max(0, Math.min(width - 1, prev.active.col + colDelta)),
      };
      if (extend) {
        return { mode: "idle", active: next, anchor: prev.anchor, focus: next };
      }
      return { mode: "idle", active: next, anchor: next, focus: next };
    });
  }, [height, width]);

  const focusCell = useCallback((coord: Coord) => {
    const key = `${coord.row}:${coord.col}`;
    const el = cellRefs.current.get(key);
    if (el) el.focus();
  }, []);

  useEffect(() => {
    if (selection.mode === "idle") focusCell(selection.active);
  }, [selection.active, selection.mode, focusCell]);

  const startEdit = useCallback((seed?: string) => {
    if (readOnly || !activeTab) return;
    const raw = activeTab.rows[selection.active.row]?.[selection.active.col] ?? "";
    setEditValue(seed !== undefined ? seed : raw);
    setSelection((prev) => ({ ...prev, mode: "editing" }));
  }, [activeTab, selection.active, readOnly]);

  const handleCellPointerDown = (row: number, col: number, event: ReactPointerEvent<HTMLInputElement>) => {
    if (selection.mode === "editing" && (selection.active.row !== row || selection.active.col !== col)) {
      commitEdit(editValue);
    }
    if (event.shiftKey) {
      setSelection((prev) => ({ mode: "idle", active: { row, col }, anchor: prev.anchor, focus: { row, col } }));
    } else {
      setSelection({ mode: "idle", active: { row, col }, anchor: { row, col }, focus: { row, col } });
    }
    dragStateRef.current = { active: true };
  };

  const handleCellPointerEnter = (row: number, col: number) => {
    if (!dragStateRef.current?.active) return;
    setSelection((prev) => ({ mode: "idle", active: prev.active, anchor: prev.anchor, focus: { row, col } }));
  };

  useEffect(() => {
    const end = () => { dragStateRef.current = null; };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  const handleCellChange = (row: number, col: number, event: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (selection.active.row !== row || selection.active.col !== col) {
      setSelection({ mode: "editing", active: { row, col }, anchor: { row, col }, focus: { row, col } });
    } else if (selection.mode !== "editing") {
      setSelection((prev) => ({ ...prev, mode: "editing" }));
    }
    setEditValue(event.target.value);
  };

  const handleCellBlur = () => {
    if (selection.mode === "editing" && editValue !== null) {
      commitEdit(editValue);
    }
  };

  const handleGridKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (!activeTab) return;
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      controller.undo();
      return;
    }
    if (mod && ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y")) {
      event.preventDefault();
      controller.redo();
      return;
    }
    if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      const text = serializeSelection(rows, rangeRect.r1, rangeRect.c1, rangeRect.r2, rangeRect.c2);
      await writeClipboard(text);
      return;
    }
    if (mod && event.key.toLowerCase() === "v") {
      event.preventDefault();
      if (readOnly) return;
      const text = await readClipboard();
      if (!text) return;
      const values = parsePasteText(text);
      if (values.length === 0) return;
      controller.apply({
        type: "PASTE",
        tabId: activeTab.id,
        startRow: selection.active.row,
        startCol: selection.active.col,
        values,
      });
      return;
    }

    if (selection.mode === "editing") {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditValue(null);
        setSelection((prev) => ({ ...prev, mode: "idle" }));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit(editValue);
        moveActive(event.shiftKey ? -1 : 1, 0);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        commitEdit(editValue);
        moveActive(0, event.shiftKey ? -1 : 1);
        return;
      }
      return;
    }

    switch (event.key) {
      case "ArrowUp": event.preventDefault(); moveActive(-1, 0, event.shiftKey); return;
      case "ArrowDown": event.preventDefault(); moveActive(1, 0, event.shiftKey); return;
      case "ArrowLeft": event.preventDefault(); moveActive(0, -1, event.shiftKey); return;
      case "ArrowRight": event.preventDefault(); moveActive(0, 1, event.shiftKey); return;
      case "Tab": event.preventDefault(); moveActive(0, event.shiftKey ? -1 : 1); return;
      case "Enter": event.preventDefault(); startEdit(); return;
      case "F2": event.preventDefault(); startEdit(); return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        if (readOnly) return;
        controller.apply({
          type: "CLEAR_RANGE",
          tabId: activeTab.id,
          r1: rangeRect.r1,
          c1: rangeRect.c1,
          r2: rangeRect.r2,
          c2: rangeRect.c2,
        });
        return;
      default:
        if (event.key.length === 1 && !mod && !readOnly) {
          event.preventDefault();
          startEdit(event.key);
        }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeTab) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) { setImportError("CSV vacío"); return; }
      const maxCols = parsed.reduce((max, row) => Math.max(max, row.length), 0);
      const normalized = parsed.map((row) => {
        const copy = [...row];
        while (copy.length < maxCols) copy.push("");
        return copy;
      });
      controller.apply({ type: "LOAD_CSV", tabId: activeTab.id, rows: normalized });
      setImportError(null);
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  const handleExportCsv = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    const text = toCsv(rows);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab?.name || "sheet"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const insertRow = (offset: 0 | 1) => {
    if (!activeTab) return;
    controller.apply({ type: "INSERT_ROW", tabId: activeTab.id, index: selection.active.row + offset });
  };
  const deleteRow = () => {
    if (!activeTab) return;
    controller.apply({ type: "DELETE_ROW", tabId: activeTab.id, index: selection.active.row });
  };
  const insertCol = (offset: 0 | 1) => {
    if (!activeTab) return;
    controller.apply({ type: "INSERT_COL", tabId: activeTab.id, index: selection.active.col + offset });
  };
  const deleteCol = () => {
    if (!activeTab) return;
    controller.apply({ type: "DELETE_COL", tabId: activeTab.id, index: selection.active.col });
  };

  const colResizeStateRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const handleColResizeStart = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    colResizeStateRef.current = { index, startX: event.clientX, startWidth: columnWidths[index] ?? DEFAULT_COL_WIDTH };
    window.addEventListener("pointermove", handleColResizeMove);
    window.addEventListener("pointerup", handleColResizeEnd, { once: true });
  };
  const handleColResizeMove = useCallback((event: globalThis.PointerEvent) => {
    const state = colResizeStateRef.current;
    if (!state) return;
    const delta = event.clientX - state.startX;
    setColumnWidth(state.index, state.startWidth + delta);
  }, [setColumnWidth]);
  const handleColResizeEnd = useCallback(() => {
    colResizeStateRef.current = null;
    window.removeEventListener("pointermove", handleColResizeMove);
  }, [handleColResizeMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleColResizeMove);
    };
  }, [handleColResizeMove]);

  const activeRef = activeTab ? formatRef(selection.active) : "";
  const activeRaw = activeTab?.rows[selection.active.row]?.[selection.active.col] ?? "";
  const formulaValue = selection.mode === "editing" && editValue !== null ? editValue : activeRaw;

  const onFormulaChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    setEditValue(event.target.value);
    setSelection((prev) => ({ ...prev, mode: "editing" }));
  };
  const onFormulaBlur = () => {
    if (selection.mode === "editing" && editValue !== null) commitEdit(editValue);
  };

  const openContextMenu = (target: ContextMenu["target"], index: number, event: ReactMouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, target, index });
  };
  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const totalWidth = ROW_HEADER_WIDTH + columnWidths.reduce((sum, w) => sum + (w ?? DEFAULT_COL_WIDTH), 0);

  return (
    <div className="sheet-editor" data-testid="sheet-editor">
      <div className="sheet-toolbar">
        <div className="group">
          <button
            type="button"
            onClick={() => controller.undo()}
            disabled={controller.past.length === 0}
            title="Undo (Cmd/Ctrl+Z)"
            data-testid="sheet-undo"
          >
            <Undo2 size={14} /> Undo
          </button>
          <button
            type="button"
            onClick={() => controller.redo()}
            disabled={controller.future.length === 0}
            title="Redo (Cmd/Ctrl+Shift+Z)"
            data-testid="sheet-redo"
          >
            <Redo2 size={14} /> Redo
          </button>
        </div>
        <div className="divider" />
        <div className="group">
          <button type="button" onClick={() => insertRow(0)} title="Insert row above" data-testid="sheet-insert-row-above">
            <ArrowUpFromLine size={14} /> Row ↑
          </button>
          <button type="button" onClick={() => insertRow(1)} title="Insert row below" data-testid="sheet-insert-row-below">
            <ArrowDownFromLine size={14} /> Row ↓
          </button>
          <button type="button" onClick={deleteRow} title="Delete row" data-testid="sheet-delete-row">
            <Minus size={14} /> Row
          </button>
        </div>
        <div className="divider" />
        <div className="group">
          <button type="button" onClick={() => insertCol(0)} title="Insert column left" data-testid="sheet-insert-col-left">
            <ArrowLeftFromLine size={14} /> Col ←
          </button>
          <button type="button" onClick={() => insertCol(1)} title="Insert column right" data-testid="sheet-insert-col-right">
            <ArrowRightFromLine size={14} /> Col →
          </button>
          <button type="button" onClick={deleteCol} title="Delete column" data-testid="sheet-delete-col">
            <Minus size={14} /> Col
          </button>
        </div>
        <div className="divider" />
        <div className="group">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            style={{ display: "none" }}
            onChange={handleImportFile}
            data-testid="sheet-import-csv-input"
          />
          <button type="button" onClick={handleImportClick} title="Import CSV" data-testid="sheet-import-csv">
            <Upload size={14} /> Import
          </button>
          <button type="button" onClick={handleExportCsv} title="Export CSV" data-testid="sheet-export-csv">
            <Download size={14} /> Export
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="primary" onClick={onSave} data-testid="save-sheet">
          <Save size={14} /> Save
        </button>
      </div>

      <div className="sheet-formula-bar">
        <span className="ref">{activeRef}</span>
        <input
          value={formulaValue}
          onChange={onFormulaChange}
          onBlur={onFormulaBlur}
          placeholder="Raw value or =formula"
          data-testid="sheet-formula-input"
          readOnly={readOnly}
        />
      </div>

      {importError ? <div className="sheet-status" role="alert">{importError}</div> : null}

      <div
        className="sheet-grid-shell"
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
      >
        <table className="sheet-grid" style={{ width: totalWidth }}>
          <colgroup>
            <col style={{ width: ROW_HEADER_WIDTH }} />
            {columnWidths.map((w, i) => (
              <col key={`col-${i}`} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="corner" />
              {columnWidths.map((_, colIndex) => {
                const isActive = colIndex >= rangeRect.c1 && colIndex <= rangeRect.c2;
                return (
                  <th
                    key={`head-${colIndex}`}
                    className={isActive ? "active-header" : ""}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      setSelection({
                        mode: "idle",
                        active: { row: 0, col: colIndex },
                        anchor: { row: 0, col: colIndex },
                        focus: { row: height - 1, col: colIndex },
                      });
                    }}
                    onContextMenu={(event) => openContextMenu("col", colIndex, event)}
                    data-testid={`sheet-col-header-${colIndex}`}
                  >
                    {indexToColLetter(colIndex)}
                    <div
                      className="sheet-col-resize-handle"
                      data-testid={`sheet-col-resize-${colIndex}`}
                      onPointerDown={(event) => handleColResizeStart(colIndex, event)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} style={{ height: ROW_HEIGHT }}>
                <th
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    setSelection({
                      mode: "idle",
                      active: { row: rowIndex, col: 0 },
                      anchor: { row: rowIndex, col: 0 },
                      focus: { row: rowIndex, col: width - 1 },
                    });
                  }}
                  onContextMenu={(event) => openContextMenu("row", rowIndex, event)}
                  data-testid={`sheet-row-header-${rowIndex}`}
                >
                  {rowIndex + 1}
                </th>
                {row.map((_, colIndex) => {
                  const key = `${rowIndex}:${colIndex}`;
                  const isActive = selection.active.row === rowIndex && selection.active.col === colIndex;
                  const inRange = rowIndex >= rangeRect.r1 && rowIndex <= rangeRect.r2
                    && colIndex >= rangeRect.c1 && colIndex <= rangeRect.c2;
                  const computed = evaluated[rowIndex]?.[colIndex] ?? "";
                  const isError = typeof computed === "string" && computed.startsWith("#") && computed.endsWith("!");
                  const displayValue = isActive && selection.mode === "editing" && editValue !== null
                    ? editValue
                    : computed;
                  const isNumericDisplay = !isError && displayValue !== "" && Number.isFinite(Number(displayValue));
                  const cellTestId = rowIndex === 1 && colIndex === 1 ? "sheet-cell-b2" : `sheet-cell-${formatRef({ row: rowIndex, col: colIndex }).toLowerCase()}`;
                  const classes = [
                    isActive ? "active" : "",
                    inRange && !isActive ? "in-range" : "",
                    isError ? "error" : "",
                    isNumericDisplay ? "numeric" : "",
                  ].filter(Boolean).join(" ");
                  const cellStyle: CSSProperties = {};
                  return (
                    <td
                      key={key}
                      className={classes}
                      style={cellStyle}
                      onContextMenu={(event) => openContextMenu("cell", 0, event)}
                    >
                      <input
                        ref={(el) => {
                          if (el) cellRefs.current.set(key, el);
                          else cellRefs.current.delete(key);
                        }}
                        value={displayValue}
                        data-testid={cellTestId}
                        onPointerDown={(event) => handleCellPointerDown(rowIndex, colIndex, event)}
                        onPointerEnter={() => handleCellPointerEnter(rowIndex, colIndex)}
                        onDoubleClick={() => startEdit()}
                        onFocus={() => {
                          if (!isActive) {
                            setSelection({
                              mode: "idle",
                              active: { row: rowIndex, col: colIndex },
                              anchor: { row: rowIndex, col: colIndex },
                              focus: { row: rowIndex, col: colIndex },
                            });
                          }
                        }}
                        onChange={(event) => handleCellChange(rowIndex, colIndex, event)}
                        onBlur={handleCellBlur}
                        readOnly={readOnly}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sheet-tabs">
        {value.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${tab.id === controller.activeTabId ? "active" : ""}`}
            onClick={() => controller.setActiveTabId(tab.id)}
            data-testid={`sheet-tab-${tab.id}`}
          >
            {tab.name}
          </button>
        ))}
        <button
          type="button"
          className="add"
          onClick={() => controller.apply({ type: "ADD_TAB" })}
          title="Add tab"
          data-testid="sheet-add-tab"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="sheet-status">
        <span>Selection: {formatRef({ row: rangeRect.r1, col: rangeRect.c1 })}
          {rangeRect.r1 !== rangeRect.r2 || rangeRect.c1 !== rangeRect.c2
            ? `:${formatRef({ row: rangeRect.r2, col: rangeRect.c2 })}`
            : ""}
        </span>
        <span>Size: {height} × {width}</span>
      </div>

      {contextMenu ? (
        <div
          className="sheet-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => { insertRow(0); closeContextMenu(); }}>Insert row above</button>
          <button type="button" onClick={() => { insertRow(1); closeContextMenu(); }}>Insert row below</button>
          <button type="button" onClick={() => { deleteRow(); closeContextMenu(); }}>Delete row</button>
          <div className="separator" />
          <button type="button" onClick={() => { insertCol(0); closeContextMenu(); }}>Insert column left</button>
          <button type="button" onClick={() => { insertCol(1); closeContextMenu(); }}>Insert column right</button>
          <button type="button" onClick={() => { deleteCol(); closeContextMenu(); }}>Delete column</button>
          <div className="separator" />
          <button
            type="button"
            onClick={() => {
              if (!activeTab) return;
              controller.apply({ type: "CLEAR_RANGE", tabId: activeTab.id, r1: rangeRect.r1, c1: rangeRect.c1, r2: rangeRect.r2, c2: rangeRect.c2 });
              closeContextMenu();
            }}
          >
            <Trash2 size={13} /> Clear range
          </button>
        </div>
      ) : null}
    </div>
  );
}
