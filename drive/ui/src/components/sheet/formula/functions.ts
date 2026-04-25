import type { CellValue, FormulaError } from "./engine";
import { ERR } from "./engine";

export type RangeValues = CellValue[];

export type BuiltIn = (args: (CellValue | RangeValues)[]) => CellValue;

function flattenNumeric(args: (CellValue | RangeValues)[]): number[] {
  const out: number[] = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const v of arg) pushNumeric(out, v);
    } else {
      pushNumeric(out, arg);
    }
  }
  return out;
}

function pushNumeric(out: number[], value: CellValue): void {
  if (typeof value === "number") { out.push(value); return; }
  if (typeof value === "boolean") { out.push(value ? 1 : 0); return; }
  if (typeof value === "string") {
    if (value === "") return;
    const n = Number(value);
    if (Number.isFinite(n)) out.push(n);
  }
}

function firstError(args: (CellValue | RangeValues)[]): FormulaError | null {
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const v of arg) {
        if (isError(v)) return v;
      }
    } else if (isError(arg)) {
      return arg;
    }
  }
  return null;
}

function isError(value: CellValue): value is FormulaError {
  return typeof value === "string" && value.startsWith("#") && value.endsWith("!");
}

export const builtIns: Record<string, BuiltIn> = {
  SUM(args) {
    const err = firstError(args);
    if (err) return err;
    const numbers = flattenNumeric(args);
    return numbers.reduce((sum, n) => sum + n, 0);
  },
  AVERAGE(args) {
    const err = firstError(args);
    if (err) return err;
    const numbers = flattenNumeric(args);
    if (numbers.length === 0) return ERR.DIV0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  },
  COUNT(args) {
    const err = firstError(args);
    if (err) return err;
    return flattenNumeric(args).length;
  },
  MIN(args) {
    const err = firstError(args);
    if (err) return err;
    const numbers = flattenNumeric(args);
    if (numbers.length === 0) return 0;
    return Math.min(...numbers);
  },
  MAX(args) {
    const err = firstError(args);
    if (err) return err;
    const numbers = flattenNumeric(args);
    if (numbers.length === 0) return 0;
    return Math.max(...numbers);
  },
  IF(args) {
    if (args.length < 2 || args.length > 3) return ERR.VALUE;
    const cond = args[0];
    if (Array.isArray(cond)) return ERR.VALUE;
    if (isError(cond)) return cond;
    const truthy =
      typeof cond === "boolean" ? cond :
      typeof cond === "number" ? cond !== 0 :
      typeof cond === "string" ? cond.length > 0 && cond.toUpperCase() !== "FALSE" :
      false;
    const branch = truthy ? args[1] : (args[2] ?? false);
    if (Array.isArray(branch)) return ERR.VALUE;
    return branch;
  },
  NOT(args) {
    if (args.length !== 1) return ERR.VALUE;
    const value = args[0];
    if (Array.isArray(value)) return ERR.VALUE;
    if (isError(value)) return value;
    if (typeof value === "boolean") return !value;
    if (typeof value === "number") return value === 0;
    return ERR.VALUE;
  },
  AND(args) {
    const err = firstError(args);
    if (err) return err;
    for (const arg of args) {
      const values = Array.isArray(arg) ? arg : [arg];
      for (const v of values) {
        if (typeof v === "boolean" && !v) return false;
        if (typeof v === "number" && v === 0) return false;
      }
    }
    return true;
  },
  OR(args) {
    const err = firstError(args);
    if (err) return err;
    for (const arg of args) {
      const values = Array.isArray(arg) ? arg : [arg];
      for (const v of values) {
        if (typeof v === "boolean" && v) return true;
        if (typeof v === "number" && v !== 0) return true;
      }
    }
    return false;
  },
};
