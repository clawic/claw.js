import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BIRDWATCHING_SIGHTINGS: BuiltinCollectionDefinition = {
  name: "birdwatching_sightings",
  displayName: "Birdwatching Sightings",
  family: "luxury_and_collecting",
  aliases: ["bird_sighting","birdwatching_sightings"],
  fields: [
    { name: "species", type: "text", required: true },
    { name: "locationGeo", type: "geo_point" },
    { name: "count", type: "number" },
    { name: "behavior", type: "text" },
    { name: "weather", type: "text" },
    { name: "image", type: "file" },
    { name: "recordingAudio", type: "file" },
    { name: "sightedAt", type: "date", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "birdwatching_sightings_species_idx", fields: ["species"] },
    { name: "birdwatching_sightings_sighted_idx", fields: ["sightedAt"] },
  ],
};
