import { describe, expect, test } from "vitest";

import { listClawRuntimeModels } from "./claw-runtime.ts";

describe("claw runtime model catalog", () => {
  test("does not expose pre-v1 legacy model labels or flags", () => {
    const models = listClawRuntimeModels({ adapter: "claw", provider: "deepseek" });

    expect(models.some((model) => model.label.toLowerCase().includes("legacy"))).toBe(false);
    expect(models.some((model) => "legacy" in model)).toBe(false);
  });
});
