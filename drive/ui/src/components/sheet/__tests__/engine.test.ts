import { describe, it, expect } from "vitest";
import { evaluateTab } from "../formula/engine";

function make(rows: string[][]): string[][] {
  return rows.map((row) => [...row]);
}

describe("engine", () => {
  it("returns raw values for non-formula cells", () => {
    const rows = make([["hi", "1"], ["2", ""]]);
    expect(evaluateTab(rows)).toEqual([["hi", "1"], ["2", ""]]);
  });

  it("evaluates simple arithmetic", () => {
    expect(evaluateTab(make([["=1+2"]]))).toEqual([["3"]]);
    expect(evaluateTab(make([["=2*3+4"]]))).toEqual([["10"]]);
    expect(evaluateTab(make([["=(2+3)*4"]]))).toEqual([["20"]]);
    expect(evaluateTab(make([["=-5+10"]]))).toEqual([["5"]]);
  });

  it("resolves cell references", () => {
    const rows = make([
      ["1", "2"],
      ["=A1+B1", "=A2*2"],
    ]);
    expect(evaluateTab(rows)).toEqual([
      ["1", "2"],
      ["3", "6"],
    ]);
  });

  it("supports SUM, AVERAGE, COUNT over ranges", () => {
    const rows = make([
      ["1", "2", "3"],
      ["=SUM(A1:C1)", "=AVERAGE(A1:C1)", "=COUNT(A1:C1)"],
    ]);
    const out = evaluateTab(rows);
    expect(out[1]).toEqual(["6", "2", "3"]);
  });

  it("supports MIN, MAX", () => {
    const rows = make([
      ["4", "2", "9"],
      ["=MIN(A1:C1)", "=MAX(A1:C1)", ""],
    ]);
    const out = evaluateTab(rows);
    expect(out[1][0]).toBe("2");
    expect(out[1][1]).toBe("9");
  });

  it("supports IF with string branches", () => {
    expect(evaluateTab(make([["5"], ["=IF(A1>0,\"y\",\"n\")"]]))).toEqual([["5"], ["y"]]);
    expect(evaluateTab(make([["-1"], ["=IF(A1>0,\"y\",\"n\")"]]))).toEqual([["-1"], ["n"]]);
  });

  it("reports #CIRC! for cycles", () => {
    const rows = make([
      ["=A2"],
      ["=A1"],
    ]);
    const out = evaluateTab(rows);
    expect(out[0][0]).toBe("#CIRC!");
  });

  it("reports #NAME? for unknown functions", () => {
    expect(evaluateTab(make([["=FOO(1)"]]))).toEqual([["#NAME?"]]);
  });

  it("reports #DIV/0! for divide by zero", () => {
    expect(evaluateTab(make([["=1/0"]]))).toEqual([["#DIV/0!"]]);
  });

  it("reports #PARSE! for bad syntax", () => {
    expect(evaluateTab(make([["=1++"]]))).toEqual([["#PARSE!"]]);
  });

  it("handles string concatenation with &", () => {
    const rows = make([["=\"hello\" & \" \" & \"world\""]]);
    expect(evaluateTab(rows)).toEqual([["hello world"]]);
  });

  it("comparisons yield TRUE/FALSE", () => {
    expect(evaluateTab(make([["=1<2"]]))).toEqual([["TRUE"]]);
    expect(evaluateTab(make([["=2<>2"]]))).toEqual([["FALSE"]]);
  });

  it("SUM ignores empty cells and non-numeric strings", () => {
    const rows = make([
      ["1", "", "x", "3"],
      ["=SUM(A1:D1)", "", "", ""],
    ]);
    expect(evaluateTab(rows)[1][0]).toBe("4");
  });

  it("AVERAGE returns #DIV/0! over empty range", () => {
    const rows = make([
      ["", "", ""],
      ["=AVERAGE(A1:C1)", "", ""],
    ]);
    expect(evaluateTab(rows)[1][0]).toBe("#DIV/0!");
  });
});
