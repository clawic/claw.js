import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, detectDelimiter, toTsv } from "../csv";

describe("csv", () => {
  it("round-trips simple rows", () => {
    const rows = [["a", "b"], ["c", "d"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("escapes cells with commas", () => {
    const rows = [["hello, world", "b"]];
    const csv = toCsv(rows);
    expect(csv).toBe("\"hello, world\",b");
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("escapes quotes inside cells", () => {
    const rows = [["say \"hi\"", "ok"]];
    const csv = toCsv(rows);
    expect(csv).toBe("\"say \"\"hi\"\"\",ok");
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("handles embedded newlines", () => {
    const rows = [["line1\nline2", "end"]];
    const csv = toCsv(rows);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("detects tab delimiter", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("detects semicolon delimiter", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("detects comma by default", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("toTsv serializes tab-separated", () => {
    const rows = [["a", "b"], ["c", "d"]];
    expect(toTsv(rows)).toBe("a\tb\r\nc\td");
  });

  it("parses CRLF input", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles trailing newline without adding empty row twice", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
  });
});
