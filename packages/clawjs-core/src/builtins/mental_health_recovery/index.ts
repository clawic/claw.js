import type { BuiltinFamilyDefinition } from "../_types.ts";
import { CRAVINGS_LOGS } from "./cravings_logs.ts";
import { DISSOCIATION_EVENTS } from "./dissociation_events.ts";
import { EATING_DISORDER_BEHAVIORS } from "./eating_disorder_behaviors.ts";
import { MOOD_EPISODES } from "./mood_episodes.ts";
import { PANIC_ANXIETY_LOGS } from "./panic_anxiety_logs.ts";
import { SELF_HARM_URGES } from "./self_harm_urges.ts";
import { SOBRIETY_SLIPS } from "./sobriety_slips.ts";
import { SOBRIETY_TRACKERS } from "./sobriety_trackers.ts";
import { THERAPISTS } from "./therapists.ts";
import { THERAPY_SESSIONS } from "./therapy_sessions.ts";

export const MENTAL_HEALTH_RECOVERY_FAMILY: BuiltinFamilyDefinition = {
  name: "mental_health_recovery",
  displayName: "Mental Health & Recovery",
  description: "Therapy, panic logs, mood episodes, sobriety trackers, cravings, dissociation, ED behaviors, self-harm urges.",
  collections: [CRAVINGS_LOGS, DISSOCIATION_EVENTS, EATING_DISORDER_BEHAVIORS, MOOD_EPISODES, PANIC_ANXIETY_LOGS, SELF_HARM_URGES, SOBRIETY_SLIPS, SOBRIETY_TRACKERS, THERAPISTS, THERAPY_SESSIONS],
};

export { CRAVINGS_LOGS, DISSOCIATION_EVENTS, EATING_DISORDER_BEHAVIORS, MOOD_EPISODES, PANIC_ANXIETY_LOGS, SELF_HARM_URGES, SOBRIETY_SLIPS, SOBRIETY_TRACKERS, THERAPISTS, THERAPY_SESSIONS };
