import { test } from "node:test";
import assert from "node:assert/strict";

import { vehiclePlugin, validateVehicleOffer, vehicleOfferToCbor, VEHICLE_VERTICAL_ID } from "../src/index.ts";

test("vehicle/v1: plugin id and archetype", () => {
  assert.equal(vehiclePlugin.id, VEHICLE_VERTICAL_ID);
  assert.equal(vehiclePlugin.archetype, "both");
});

test("vehicle/v1: VIN length enforcement", () => {
  assert.throws(() => validateVehicleOffer({
    transaction: "sale", title: "Civic", make: "Honda", model: "Civic", year: 2018,
    km: 90000, fuel_type: "gasoline", condition: "good", geo_zone: "u4pr",
    price_eur: 9500, vin_full: "TOOSHORT",
    photos_blurred: [{ hash: new Uint8Array(32), size: 1, mime: "image/jpeg" }],
  }), /vin_full must be exactly 17/);
});

test("vehicle/v1: matchExtractor returns geo, transaction, priceBand", () => {
  const cbor = vehicleOfferToCbor({
    transaction: "sale", title: "Civic", make: "Honda", model: "Civic", year: 2018,
    km: 90000, fuel_type: "gasoline", condition: "good", geo_zone: "u4pr",
    price_eur: 9500,
    photos_blurred: [{ hash: new Uint8Array(32), size: 1, mime: "image/jpeg" }],
  });
  const m = vehiclePlugin.matchExtractors.offer({ fields: cbor });
  assert.equal(m.geoZone, "u4pr");
  assert.equal(m.tag, "sale");
  assert.equal(m.priceBand, 3);
});
