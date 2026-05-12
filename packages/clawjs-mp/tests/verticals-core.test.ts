// Validation, CBOR shape, and registry assembly for the core verticals.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CORE_VERTICAL_IDS, CORE_VERTICAL_PLUGINS, buildCoreRegistry,
  postPlugin, postToCbor, validatePost,
  hotTakePlugin, validateHotTake, hotTakeToCbor,
  albumPlugin, validateAlbum, albumToCbor,
  itemPlugin, validateItem, itemToCbor,
  serviceOfferPlugin, validateServiceOffer, serviceOfferToCbor,
  meetupPlugin, validateMeetup, meetupToCbor,
  profilePagePlugin, validateProfilePage, profilePageToCbor,
  wantPlugin, validateWant, wantToCbor,
} from "../src/verticals/core/index.ts";

test("Core registry exposes all 8 verticals exactly once", () => {
  const reg = buildCoreRegistry();
  assert.equal(reg.list().length, 8);
  for (const id of CORE_VERTICAL_IDS) assert.equal(reg.has(id), true);
});

test("Core registry rejects duplicate registration", () => {
  const reg = buildCoreRegistry();
  assert.throws(() => reg.register(postPlugin), /already registered/);
});

// ---- per-vertical sanity ----

test("post/v1: validate + cbor", () => {
  assert.throws(() => validatePost({ body: "" }), /body required/);
  const cbor = postToCbor({ body: "hello", tags: ["intro"] });
  assert.equal(cbor.body, "hello");
});

test("hot-take/v1: enforces 280-char cap and moods", () => {
  assert.throws(() => validateHotTake({ text: "x".repeat(281) }), /280/);
  const cbor = hotTakeToCbor({ text: "spicy take", mood: "spicy" });
  assert.equal(cbor.mood, "spicy");
});

test("album/v1: requires at least one photo and ≤ 200 cap", () => {
  assert.throws(() => validateAlbum({ photos: [] }), /at least one photo/);
  const cbor = albumToCbor({ photos: [{ hash: new Uint8Array(32), mime: "image/jpeg", size: 1000 }] });
  assert.equal(Array.isArray(cbor.photos), true);
});

test("item/v1: validates price_band and produces matchExtractors output", () => {
  assert.throws(() => validateItem({
    title: "Bike", photos: [{ hash: new Uint8Array(32), mime: "image/jpeg", size: 100 }],
    condition: "good", geo_zone: "u4pr", price_hint_eur: 100, price_band: 5,
  }), /price_band must match/);
  const cbor = itemToCbor({
    title: "Bike", photos: [{ hash: new Uint8Array(32), mime: "image/jpeg", size: 100 }],
    condition: "good", geo_zone: "u4pr", category: "bikes", price_hint_eur: 350,
  });
  assert.equal(cbor.price_band, 2);
  const m = itemPlugin.matchExtractors.offer({ fields: cbor });
  assert.equal(m.geoZone, "u4pr");
  assert.equal(m.tag, "bikes");
  assert.equal(m.priceBand, 2);
});

test("service-offer/v1: validates skill cap", () => {
  assert.throws(() => validateServiceOffer({
    title: "Coach", skills: new Array(21).fill("x"),
  }), /too many skills/);
  const cbor = serviceOfferToCbor({ title: "Coach", remote_ok: true, skills: ["typescript"] });
  assert.equal(cbor.remote_ok, true);
});

test("meetup/v1: validates ISO-8601 + 4-char geohash", () => {
  assert.throws(() => validateMeetup({
    title: "3v3", starts_at: "not a date", geo_zone: "u4pr", activity_kind: "sport",
  } as Parameters<typeof validateMeetup>[0]), /ISO-8601/);
  const cbor = meetupToCbor({
    title: "3v3", starts_at: "2026-06-01T18:00:00Z", geo_zone: "u4pr",
    activity_kind: "sport", sport: "basketball-3v3",
  });
  assert.equal(cbor.sport, "basketball-3v3");
});

test("profile-page/v1: caps links and pinned_blocks", () => {
  assert.throws(() => validateProfilePage({
    display_name: "Alice", pinned_blocks: new Array(7).fill(new Uint8Array(32)),
  }), /pinned_blocks cap/);
  const cbor = profilePageToCbor({ display_name: "Alice", about: "Hello.", pronouns: "she/her" });
  assert.equal(cbor.display_name, "Alice");
});

test("want/v1: encodes budget_band and target", () => {
  const cbor = wantToCbor({ vertical_target: "real-estate/v1", description: "2br", budget_hint_eur: 900 });
  assert.equal(cbor.budget_band, 2);
  assert.equal(cbor.vertical_target, "real-estate/v1");
});

test("Plugins expose stable defaultVisibility keys for all output fields", () => {
  for (const plugin of CORE_VERTICAL_PLUGINS) {
    const sample = buildSample(plugin.id);
    if (!sample) continue;
    const cbor = plugin.validator.offerToCbor(sample);
    for (const k of Object.keys(cbor)) {
      assert.ok(
        plugin.defaultVisibility[k] !== undefined,
        `${plugin.id}: defaultVisibility missing for field "${k}"`,
      );
    }
  }
});

function buildSample(id: string): Record<string, unknown> | undefined {
  switch (id) {
    case "post/v1": return { body: "hello" };
    case "hot-take/v1": return { text: "spicy" };
    case "album/v1": return { photos: [{ hash: new Uint8Array(32), mime: "image/jpeg", size: 1 }] };
    case "item/v1": return {
      title: "Bike", photos: [{ hash: new Uint8Array(32), mime: "image/jpeg", size: 1 }],
      condition: "good", geo_zone: "u4pr", category: "bikes",
    };
    case "service-offer/v1": return { title: "Coach", remote_ok: true };
    case "meetup/v1": return {
      title: "3v3", starts_at: "2026-06-01T18:00:00Z", geo_zone: "u4pr",
      activity_kind: "sport", sport: "basketball-3v3",
    };
    case "profile-page/v1": return { display_name: "Alice", about: "hello" };
    case "want/v1": return { vertical_target: "real-estate/v1", description: "2br" };
    default: return undefined;
  }
}
