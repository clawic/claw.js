// Synthetic vertical used for Phase 1 protocol tests. Not for production.

import type { CborValue } from "../cbor.ts";

export const TEST_VERTICAL_ID = "test-vertical/v1";

export interface TestVerticalFields {
  title: string;
  tag: string;
  geo_zone: string;
  summary?: string;
  secret_a?: string;
  secret_b?: string;
}

export const TEST_VERTICAL_DEFAULT_VISIBILITY: Record<string, number> = {
  title: 0,
  tag: 0,
  geo_zone: 0,
  summary: 1,
  secret_a: 2,
  secret_b: 4,
};

export function validateTestVertical(fields: TestVerticalFields): void {
  if (!fields.title) throw new Error("test-vertical: title required");
  if (!fields.tag) throw new Error("test-vertical: tag required");
  if (!fields.geo_zone || fields.geo_zone.length !== 4) {
    throw new Error("test-vertical: geo_zone must be a 4-char geohash");
  }
}

export function asCbor(fields: TestVerticalFields): Record<string, CborValue> {
  validateTestVertical(fields);
  const out: Record<string, CborValue> = {
    title: fields.title,
    tag: fields.tag,
    geo_zone: fields.geo_zone,
  };
  if (fields.summary !== undefined) out.summary = fields.summary;
  if (fields.secret_a !== undefined) out.secret_a = fields.secret_a;
  if (fields.secret_b !== undefined) out.secret_b = fields.secret_b;
  return out;
}
