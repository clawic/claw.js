import { describe, it, expect } from "vitest";
import { colLetterToIndex, indexToColLetter, parseRef, parseRange, formatRef } from "../formula/a1";

describe("a1", () => {
  it("indexToColLetter round-trip for single and multi-letter columns", () => {
    expect(indexToColLetter(0)).toBe("A");
    expect(indexToColLetter(25)).toBe("Z");
    expect(indexToColLetter(26)).toBe("AA");
    expect(indexToColLetter(51)).toBe("AZ");
    expect(indexToColLetter(52)).toBe("BA");
    expect(indexToColLetter(701)).toBe("ZZ");
    expect(indexToColLetter(702)).toBe("AAA");
  });

  it("colLetterToIndex is inverse of indexToColLetter", () => {
    for (let i = 0; i < 1000; i += 1) {
      expect(colLetterToIndex(indexToColLetter(i))).toBe(i);
    }
  });

  it("colLetterToIndex rejects lowercase", () => {
    expect(() => colLetterToIndex("aa")).toThrow();
  });

  it("parseRef returns zero-based row and col", () => {
    expect(parseRef("A1")).toEqual({ row: 0, col: 0 });
    expect(parseRef("B3")).toEqual({ row: 2, col: 1 });
    expect(parseRef("AA10")).toEqual({ row: 9, col: 26 });
  });

  it("parseRange normalizes bounds", () => {
    expect(parseRange("A1:B5")).toEqual({ r1: 0, c1: 0, r2: 4, c2: 1 });
    expect(parseRange("B5:A1")).toEqual({ r1: 0, c1: 0, r2: 4, c2: 1 });
  });

  it("formatRef round-trips parseRef", () => {
    expect(formatRef(parseRef("AA10"))).toBe("AA10");
    expect(formatRef({ row: 0, col: 0 })).toBe("A1");
  });
});
