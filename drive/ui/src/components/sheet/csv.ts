export interface ParseCsvOptions {
  delimiter?: "," | ";" | "\t";
  autoDetect?: boolean;
}

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  const entries = Object.entries(counts) as [",", number][] | [";", number][] | ["\t", number][];
  let best: "," | ";" | "\t" = ",";
  let bestCount = counts[","];
  for (const [delim, count] of Object.entries(counts) as ["," | ";" | "\t", number][]) {
    if (count > bestCount) {
      best = delim;
      bestCount = count;
    }
  }
  void entries;
  return best;
}

export function parseCsv(text: string, options: ParseCsvOptions = {}): string[][] {
  const delimiter = options.delimiter ?? (options.autoDetect === false ? "," : detectDelimiter(text));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const src = text;

  const pushCell = () => { row.push(cell); cell = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === "\"") {
        if (src[i + 1] === "\"") {
          cell += "\"";
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }

  return rows;
}

export function toCsv(rows: string[][], delimiter: "," | ";" | "\t" = ","): string {
  return rows.map((row) => row.map((cell) => escapeCell(cell, delimiter)).join(delimiter)).join("\r\n");
}

function escapeCell(cell: string, delimiter: string): string {
  if (cell === "") return cell;
  if (cell.includes(delimiter) || cell.includes("\"") || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, "\"\"")}"`;
  }
  return cell;
}

export function toTsv(rows: string[][]): string {
  return toCsv(rows, "\t");
}
