import { test } from "node:test";
import assert from "node:assert/strict";

import {
  realEstatePlugin, REAL_ESTATE_VERTICAL_ID, realEstateDiscoveryKey,
} from "../src/index.ts";

test("real-estate/v1: plugin id", () => {
  assert.equal(realEstatePlugin.id, REAL_ESTATE_VERTICAL_ID);
  assert.equal(realEstatePlugin.archetype, "both");
  assert.equal(realEstatePlugin.uiHints?.surface, "marketplace");
});

test("real-estate/v1: matchExtractor returns expected discoveryKey shape", () => {
  const m = realEstatePlugin.matchExtractors.offer({
    fields: { geo_zone: "u4pr", transaction: "rental_long", price_band: 3 },
  });
  assert.equal(m.geoZone, "u4pr");
  assert.equal(m.tag, "rental_long");
  assert.equal(m.priceBand, 3);
});

test("real-estate/v1: discoveryKey deterministic", () => {
  const a = realEstateDiscoveryKey({ transaction: "sale", geo_zone: "u4pr", price_eur: 250000 });
  const b = realEstateDiscoveryKey({ transaction: "sale", geo_zone: "u4pr", price_eur: 250000 });
  assert.deepEqual(Array.from(a), Array.from(b));
});
