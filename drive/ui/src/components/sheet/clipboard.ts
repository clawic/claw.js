import { toTsv, parseCsv } from "./csv";

export function serializeSelection(rows: string[][], r1: number, c1: number, r2: number, c2: number): string {
  const slice: string[][] = [];
  for (let r = r1; r <= r2; r += 1) {
    const row: string[] = [];
    for (let c = c1; c <= c2; c += 1) {
      row.push(rows[r]?.[c] ?? "");
    }
    slice.push(row);
  }
  return toTsv(slice);
}

export function parsePasteText(text: string): string[][] {
  if (text.includes("\t")) {
    return parseCsv(text, { delimiter: "\t" });
  }
  return parseCsv(text);
}

export async function writeClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fall through to textarea fallback
  }
  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();
  try { document.execCommand("copy"); } catch { /* ignore */ }
  document.body.removeChild(textarea);
}

export async function readClipboard(): Promise<string> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // fall through
  }
  return "";
}
