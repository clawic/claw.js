import type { BuiltinFamilyDefinition } from "../_types.ts";
import { CONCERTS_ATTENDED } from "./concerts_attended.ts";
import { EXHIBITIONS_SEEN } from "./exhibitions_seen.ts";
import { FESTIVALS_ATTENDED } from "./festivals_attended.ts";
import { MUSEUMS_VISITED } from "./museums_visited.ts";
import { PARTIES_NIGHTLIFE_LOG } from "./parties_nightlife_log.ts";
import { SPORT_EVENTS_ATTENDED } from "./sport_events_attended.ts";
import { THEATER_OPERA_ATTENDED } from "./theater_opera_attended.ts";

export const SOCIAL_CULTURE_FAMILY: BuiltinFamilyDefinition = {
  name: "social_culture",
  displayName: "Social & Culture",
  description: "Museums, exhibitions, concerts, theater, sport events, nightlife, festivals.",
  collections: [CONCERTS_ATTENDED, EXHIBITIONS_SEEN, FESTIVALS_ATTENDED, MUSEUMS_VISITED, PARTIES_NIGHTLIFE_LOG, SPORT_EVENTS_ATTENDED, THEATER_OPERA_ATTENDED],
};

export { CONCERTS_ATTENDED, EXHIBITIONS_SEEN, FESTIVALS_ATTENDED, MUSEUMS_VISITED, PARTIES_NIGHTLIFE_LOG, SPORT_EVENTS_ATTENDED, THEATER_OPERA_ATTENDED };
