import { test } from "node:test";
import assert from "node:assert/strict";

import {
  datingPlugin, validateDatingOffer, validateDatingWant, datingOfferToCbor,
  DATING_VERTICAL_ID, DATING_MUTUAL_MATCH_CAPABILITY,
} from "../src/index.ts";

test("modules/dating/v1: rejects under-18 profiles", () => {
  const thisYear = new Date().getUTCFullYear();
  assert.throws(() => validateDatingOffer({
    display_name: "alex", birth_year: thisYear - 17, bio: "hi", looking_for: ["friends"],
    geo_zone: "u4pr",
    photos_blurred: [{ hash: new Uint8Array(32), size: 1, mime: "image/jpeg" }],
  }), /18\+/);
});

test("modules/dating/v1: want needs at least one looking_for and age_min ≥ 18", () => {
  assert.throws(() => validateDatingWant({
    geo_zone: "u4pr", age_min: 17, age_max: 30, looking_for: ["friends"],
  }), /age_min must be ≥ 18/);
  assert.throws(() => validateDatingWant({
    geo_zone: "u4pr", age_min: 18, age_max: 30, looking_for: [],
  }), /looking_for required/);
});

test("modules/dating/v1: cbor and uiHints", () => {
  const cbor = datingOfferToCbor({
    display_name: "alex", birth_year: 1995, bio: "hi", looking_for: ["long-term"],
    geo_zone: "u4pr",
    photos_blurred: [{ hash: new Uint8Array(32), size: 1, mime: "image/jpeg" }],
  });
  assert.equal(cbor.display_name, "alex");
  assert.equal(datingPlugin.uiHints?.surface, "swipe");
  assert.equal(datingPlugin.uiHints?.primaryAction, "swipe");
  assert.equal(datingPlugin.id, DATING_VERTICAL_ID);
  assert.equal(DATING_MUTUAL_MATCH_CAPABILITY, "mutual-match");
});
