import assert from "node:assert/strict";
import { test } from "vitest";

import { getTtsCatalog, listTtsProviders, normalizeTtsConfig } from "./synthesize.ts";

test("getTtsCatalog exposes provider descriptors for the demo wrapper", () => {
  const catalog = getTtsCatalog();

  assert.equal(catalog.globalFields.length, 2);
  assert.deepEqual(
    catalog.providers.map((provider) => provider.id),
    ["local", "openai", "elevenlabs", "deepgram"],
  );
  assert.equal(
    catalog.providers.find((provider) => provider.id === "openai")?.fields.some((field) => field.key === "voice"),
    true,
  );
  assert.equal(
    catalog.providers.find((provider) => provider.id === "deepgram")?.fields.some((field) => field.key === "speed"),
    false,
  );
  assert.equal(
    catalog.providers.find((provider) => provider.id === "local")?.defaultVoice,
    "auto",
  );
});

test("listTtsProviders stays aligned with the richer TTS catalog", () => {
  const providers = listTtsProviders();

  assert.deepEqual(
    providers.map((provider) => provider.id),
    getTtsCatalog().providers.map((provider) => provider.id),
  );
  assert.equal(
    providers.find((provider) => provider.id === "deepgram")?.defaultModel,
    "aura-2-thalia-en",
  );
});

test("normalizeTtsConfig applies provider defaults and strips unsupported settings", () => {
  assert.deepEqual(
    normalizeTtsConfig({
      enabled: true,
      autoRead: true,
      provider: "openai",
      apiKey: "  secret  ",
      voice: "shimmer",
      speed: 1.5,
      stability: 0.8,
    }),
    {
      enabled: true,
      autoRead: true,
      provider: "openai",
      apiKey: "secret",
      model: "tts-1",
      voice: "shimmer",
      speed: 1.5,
    },
  );

  assert.deepEqual(
    normalizeTtsConfig({
      provider: "deepgram",
      speed: 2,
    }),
    {
      enabled: false,
      autoRead: false,
      provider: "deepgram",
      model: "aura-2-thalia-en",
    },
  );
});

test("normalizeTtsConfig bounds numeric TTS settings to descriptor ranges", () => {
  assert.deepEqual(
    normalizeTtsConfig({
      provider: "elevenlabs",
      speed: 1.1,
      stability: 0.4,
      similarityBoost: 0.6,
    }),
    {
      enabled: false,
      autoRead: false,
      provider: "elevenlabs",
      voice: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.4,
      similarityBoost: 0.6,
      speed: 1.1,
    },
  );

  assert.deepEqual(
    normalizeTtsConfig({
      provider: "elevenlabs",
      speed: -1,
      stability: 2,
      similarityBoost: Number.POSITIVE_INFINITY,
    }),
    {
      enabled: false,
      autoRead: false,
      provider: "elevenlabs",
      voice: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.5,
      similarityBoost: 0.75,
      speed: 1,
    },
  );

  assert.deepEqual(
    normalizeTtsConfig({
      provider: "local",
      speed: Number.NaN,
    }),
    {
      enabled: false,
      autoRead: false,
      provider: "local",
      speed: 1,
    },
  );
});
