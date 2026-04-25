export function indexToColLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error("index must be a non-negative integer");
  let value = index;
  let letters = "";
  while (true) {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
    if (value < 0) break;
  }
  return letters;
}

export function colLetterToIndex(letters: string): number {
  if (!/^[A-Z]+$/.test(letters)) throw new Error(`invalid column letters: ${letters}`);
  let result = 0;
  for (const char of letters) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

export interface CellCoord {
  row: number;
  col: number;
}

export function parseRef(ref: string): CellCoord {
  const match = ref.match(/^([A-Z]+)([0-9]+)$/);
  if (!match) throw new Error(`invalid A1 reference: ${ref}`);
  const col = colLetterToIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (row < 0) throw new Error(`invalid A1 reference: ${ref}`);
  return { row, col };
}

export interface CellRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export function parseRange(range: string): CellRange {
  const [start, end] = range.split(":");
  if (!start || !end) throw new Error(`invalid range: ${range}`);
  const a = parseRef(start);
  const b = parseRef(end);
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col),
  };
}

export function formatRef(coord: CellCoord): string {
  return `${indexToColLetter(coord.col)}${coord.row + 1}`;
}
