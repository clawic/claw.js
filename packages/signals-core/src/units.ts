import type { Unit } from "./types.ts";

export const SHARED_UNITS = {
  count: { id: "count", label: "count", group: "abstract" },
  boolean: { id: "boolean", label: "yes/no", group: "abstract" },
  text: { id: "text", label: "text", group: "abstract" },
  score1to5: { id: "score:1-5", label: "score 1-5", group: "score" },
  score0to10: { id: "score:0-10", label: "score 0-10", group: "score" },
  percent: { id: "percent", label: "%", group: "ratio" },
  bpm: { id: "bpm", label: "bpm", group: "frequency" },
  mmHg: { id: "mmHg", label: "mmHg", group: "pressure" },
  kg: { id: "kg", label: "kg", group: "mass" },
  g: { id: "g", label: "g", group: "mass" },
  mg: { id: "mg", label: "mg", group: "mass" },
  cm: { id: "cm", label: "cm", group: "length" },
  m: { id: "m", label: "m", group: "length" },
  km: { id: "km", label: "km", group: "length" },
  ml: { id: "ml", label: "ml", group: "volume" },
  l: { id: "l", label: "l", group: "volume" },
  kcal: { id: "kcal", label: "kcal", group: "energy" },
  seconds: { id: "s", label: "s", group: "time" },
  minutes: { id: "min", label: "min", group: "time" },
  hours: { id: "h", label: "h", group: "time" },
  days: { id: "d", label: "d", group: "time" },
  celsius: { id: "C", label: "°C", group: "temperature" },
  bpmHRV: { id: "ms", label: "ms", group: "duration" },
  mmolPerL: { id: "mmol/L", label: "mmol/L", group: "concentration" },
  mgPerDL: { id: "mg/dL", label: "mg/dL", group: "concentration" },
  steps: { id: "steps", label: "steps", group: "count" },
  reps: { id: "reps", label: "reps", group: "count" },
  sets: { id: "sets", label: "sets", group: "count" },
  pages: { id: "pages", label: "pages", group: "count" },
  words: { id: "words", label: "words", group: "count" },
  currencyEUR: { id: "currency:EUR", label: "€", group: "currency" },
  currencyUSD: { id: "currency:USD", label: "$", group: "currency" },
  geo: { id: "geo:wgs84", label: "lat/lng", group: "location" },
  photo: { id: "photo", label: "photo", group: "media" },
} as const satisfies Record<string, Unit>;

export type SharedUnitKey = keyof typeof SHARED_UNITS;

export function resolveSharedUnit(key: SharedUnitKey): Unit {
  return SHARED_UNITS[key];
}
