import { parseRef, parseRange } from "./a1";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { builtIns } from "./functions";
import type { Expr } from "./ast";

export type FormulaError = "#CIRC!" | "#REF!" | "#NAME?" | "#DIV/0!" | "#VALUE!" | "#PARSE!";

export const ERR = {
  CIRC: "#CIRC!" as const,
  REF: "#REF!" as const,
  NAME: "#NAME?" as const,
  DIV0: "#DIV/0!" as const,
  VALUE: "#VALUE!" as const,
  PARSE: "#PARSE!" as const,
};

export type CellValue = number | string | boolean;

function isError(value: CellValue): value is FormulaError {
  return typeof value === "string" && value.startsWith("#") && value.endsWith("!");
}

function coerceNumber(value: CellValue): number | FormulaError {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    if (value === "") return 0;
    if (isError(value)) return value;
    const n = Number(value);
    if (!Number.isFinite(n)) return ERR.VALUE;
    return n;
  }
  return ERR.VALUE;
}

function formatValue(value: CellValue): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return ERR.VALUE;
    const rounded = Math.round(value * 1e12) / 1e12;
    return String(rounded);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return value;
}

interface EvalCtx {
  rows: string[][];
  resolving: Set<string>;
  memo: Map<string, CellValue>;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function rawAt(rows: string[][], row: number, col: number): string {
  const rowData = rows[row];
  if (!rowData) return "";
  return rowData[col] ?? "";
}

function resolveCell(ctx: EvalCtx, row: number, col: number): CellValue {
  const key = cellKey(row, col);
  if (ctx.memo.has(key)) return ctx.memo.get(key) as CellValue;
  if (ctx.resolving.has(key)) return ERR.CIRC;

  const raw = rawAt(ctx.rows, row, col);
  let result: CellValue;
  if (raw === "") {
    result = "";
  } else if (raw.startsWith("=")) {
    ctx.resolving.add(key);
    result = evaluateFormula(raw.slice(1), ctx);
    ctx.resolving.delete(key);
  } else {
    result = raw;
  }
  ctx.memo.set(key, result);
  return result;
}

function evaluateFormula(expression: string, ctx: EvalCtx): CellValue {
  let ast: Expr;
  try {
    ast = parse(tokenize(expression));
  } catch {
    return ERR.PARSE;
  }
  try {
    return evalExpr(ast, ctx);
  } catch {
    return ERR.VALUE;
  }
}

function evalExpr(expr: Expr, ctx: EvalCtx): CellValue {
  switch (expr.kind) {
    case "num": return expr.value;
    case "str": return expr.value;
    case "bool": return expr.value;
    case "ref": {
      let coord;
      try { coord = parseRef(expr.ref); } catch { return ERR.REF; }
      if (coord.row < 0 || coord.col < 0) return ERR.REF;
      if (coord.row >= ctx.rows.length || coord.col >= (ctx.rows[0]?.length ?? 0)) return "";
      return resolveCell(ctx, coord.row, coord.col);
    }
    case "range":
      return ERR.VALUE;
    case "unary": {
      const inner = evalExpr(expr.expr, ctx);
      if (isError(inner)) return inner;
      const n = coerceNumber(inner);
      if (typeof n !== "number") return n;
      return expr.op === "-" ? -n : n;
    }
    case "binary": {
      if (expr.op === "&") {
        const l = evalExpr(expr.left, ctx);
        if (isError(l)) return l;
        const r = evalExpr(expr.right, ctx);
        if (isError(r)) return r;
        return formatValue(l) + formatValue(r);
      }
      const l = evalExpr(expr.left, ctx);
      if (isError(l)) return l;
      const r = evalExpr(expr.right, ctx);
      if (isError(r)) return r;
      if (expr.op === "=" || expr.op === "<>" || expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=") {
        return compare(l, r, expr.op);
      }
      const ln = coerceNumber(l);
      if (typeof ln !== "number") return ln;
      const rn = coerceNumber(r);
      if (typeof rn !== "number") return rn;
      switch (expr.op) {
        case "+": return ln + rn;
        case "-": return ln - rn;
        case "*": return ln * rn;
        case "/":
          if (rn === 0) return ERR.DIV0;
          return ln / rn;
      }
      return ERR.VALUE;
    }
    case "call": {
      const fn = builtIns[expr.name];
      if (!fn) return ERR.NAME;
      const args = expr.args.map((arg) => {
        if (arg.kind === "range") {
          let range;
          try { range = parseRange(arg.range); } catch { return ERR.REF; }
          const values: CellValue[] = [];
          for (let r = range.r1; r <= range.r2; r += 1) {
            for (let c = range.c1; c <= range.c2; c += 1) {
              if (r < 0 || c < 0) continue;
              if (r >= ctx.rows.length) continue;
              if (c >= (ctx.rows[0]?.length ?? 0)) continue;
              values.push(resolveCell(ctx, r, c));
            }
          }
          return values;
        }
        return evalExpr(arg, ctx);
      });
      return fn(args);
    }
  }
}

function compare(l: CellValue, r: CellValue, op: "=" | "<>" | "<" | ">" | "<=" | ">="): boolean {
  const ln = typeof l === "number" ? l : typeof l === "boolean" ? (l ? 1 : 0) : Number(l);
  const rn = typeof r === "number" ? r : typeof r === "boolean" ? (r ? 1 : 0) : Number(r);
  const numeric = Number.isFinite(ln) && Number.isFinite(rn);
  if (numeric) {
    switch (op) {
      case "=": return ln === rn;
      case "<>": return ln !== rn;
      case "<": return ln < rn;
      case ">": return ln > rn;
      case "<=": return ln <= rn;
      case ">=": return ln >= rn;
    }
  }
  const ls = typeof l === "string" ? l : String(l);
  const rs = typeof r === "string" ? r : String(r);
  switch (op) {
    case "=": return ls === rs;
    case "<>": return ls !== rs;
    case "<": return ls < rs;
    case ">": return ls > rs;
    case "<=": return ls <= rs;
    case ">=": return ls >= rs;
  }
  return false;
}

export function evaluateTab(rows: string[][]): string[][] {
  const ctx: EvalCtx = {
    rows,
    resolving: new Set(),
    memo: new Map(),
  };
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const out: string[][] = [];
  for (let r = 0; r < height; r += 1) {
    const outRow: string[] = [];
    for (let c = 0; c < width; c += 1) {
      const value = resolveCell(ctx, r, c);
      outRow.push(formatValue(value));
    }
    out.push(outRow);
  }
  return out;
}
