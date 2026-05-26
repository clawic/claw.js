import { test } from "vitest";
import assert from "node:assert/strict";

import { getRuntimeAdapter, listRuntimeAdapters } from "./registry.ts";

test("runtime adapters expose support metadata with one recommended production path", () => {
  const adapters = listRuntimeAdapters();
  const recommended = adapters.filter((adapter) => adapter.recommended);
  const recommendedProduction = recommended.filter((adapter) => adapter.supportLevel === "production");
  const allowedStability = new Set(["stable", "dev-only"]);
  const allowedSupportLevels = new Set(["production", "dev-only"]);

  assert.ok(adapters.every((adapter) => allowedStability.has(adapter.stability)));
  assert.ok(adapters.every((adapter) => allowedSupportLevels.has(adapter.supportLevel)));
  assert.equal(recommended.length, 1);
  assert.equal(recommendedProduction.length, 1);
  assert.deepEqual(
    adapters
      .filter((adapter) => adapter.supportLevel === "production")
      .map((adapter) => adapter.id)
      .sort(),
    ["hermes", "openclaw"]
  );
  assert.equal(recommendedProduction[0]?.id, "openclaw");
  assert.equal(recommendedProduction[0]?.stability, "stable");
  assert.equal(recommendedProduction[0]?.supportLevel, "production");
  const hermes = getRuntimeAdapter("hermes");
  assert.equal(hermes.id, "hermes");
  assert.equal(hermes.runtimeName, "Hermes Agent");
  assert.equal(hermes.recommended, undefined);
  assert.equal(hermes.stability, "stable");
  assert.equal(hermes.supportLevel, "production");
  assert.equal(adapters.some((adapter) => adapter.id === "hermes"), true);
  assert.equal(adapters.some((adapter) => adapter.id === "codex" && adapter.stability === "dev-only" && adapter.supportLevel === "dev-only"), true);
  assert.equal(adapters.some((adapter) => adapter.id === "claw" && !adapter.recommended && adapter.stability === "stable" && adapter.supportLevel === "dev-only"), true);
});

test("runtime adapter registry resolves deterministic engine ids and rejects provider ids", async () => {
  const adapters = listRuntimeAdapters();
  const adapterIds = adapters.map((adapter) => adapter.id);

  assert.deepEqual(adapterIds, [
    "demo",
    "claw",
    "openclaw",
    "openclaude",
    "codex",
    "zeroclaw",
    "picoclaw",
    "nanobot",
    "nanoclaw",
    "nullclaw",
    "ironclaw",
    "nemoclaw",
    "hermes",
  ]);
  assert.equal(new Set(adapterIds).size, adapterIds.length);

  const codex = getRuntimeAdapter("codex");
  assert.equal(codex.id, "codex");
  assert.equal(getRuntimeAdapter("codex"), codex);

  const providers = await codex.listProviders(
    {
      async exec() {
        throw new Error("unexpected registry provider resolution command");
      },
    },
    { adapter: "codex" }
  );
  assert.deepEqual(providers.map((provider) => provider.id), ["openai-codex"]);
  assert.throws(
    () => getRuntimeAdapter("openai-codex"),
    /Unsupported runtime adapter: openai-codex/
  );
});
