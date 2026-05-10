import type { BuiltinFamilyDefinition } from "../_types.ts";
import { PERSONAL_EVENTS } from "./personal_events.ts";
import { MEMORIES } from "./memories.ts";
import { PHOTOS_CURATED } from "./photos_curated.ts";
import { PHOTO_ALBUMS } from "./photo_albums.ts";

export const EVENTS_MEMORIES_FAMILY: BuiltinFamilyDefinition = {
  name: "events_memories",
  displayName: "Events & Memories",
  description: "Personal events, memories, curated photos, albums.",
  collections: [PERSONAL_EVENTS, MEMORIES, PHOTOS_CURATED, PHOTO_ALBUMS],
};

export { PERSONAL_EVENTS, MEMORIES, PHOTOS_CURATED, PHOTO_ALBUMS };
