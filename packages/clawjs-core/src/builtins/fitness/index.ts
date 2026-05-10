import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BODY_MEASUREMENTS } from "./body_measurements.ts";
import { EXERCISES } from "./exercises.ts";
import { GYM_SESSIONS } from "./gym_sessions.ts";
import { HEART_RATE_SAMPLES } from "./heart_rate_samples.ts";
import { PERSONAL_RECORDS } from "./personal_records.ts";
import { RACE_RESULTS } from "./race_results.ts";
import { RACES_REGISTERED } from "./races_registered.ts";
import { ROUTINE_WORKOUTS } from "./routine_workouts.ts";
import { ROUTINES } from "./routines.ts";
import { RUNNING_ROUTES } from "./running_routes.ts";
import { SLEEP_LOGS } from "./sleep_logs.ts";
import { STEP_LOGS } from "./step_logs.ts";
import { SUPPLEMENTS_LOG } from "./supplements_log.ts";
import { TRAINING_BLOCKS } from "./training_blocks.ts";
import { TRAINING_PLAN_TEMPLATES } from "./training_plan_templates.ts";
import { WATER_INTAKE_LOGS } from "./water_intake_logs.ts";
import { WEIGHT_LOGS } from "./weight_logs.ts";
import { WORKOUT_EXERCISES } from "./workout_exercises.ts";
import { WORKOUTS } from "./workouts.ts";

export const FITNESS_FAMILY: BuiltinFamilyDefinition = {
  name: "fitness",
  displayName: "Fitness & Body",
  description: "Workouts, exercises, body tracking, sleep, water, running routes.",
  collections: [BODY_MEASUREMENTS, EXERCISES, GYM_SESSIONS, HEART_RATE_SAMPLES, PERSONAL_RECORDS, RACE_RESULTS, RACES_REGISTERED, ROUTINE_WORKOUTS, ROUTINES, RUNNING_ROUTES, SLEEP_LOGS, STEP_LOGS, SUPPLEMENTS_LOG, TRAINING_BLOCKS, TRAINING_PLAN_TEMPLATES, WATER_INTAKE_LOGS, WEIGHT_LOGS, WORKOUT_EXERCISES, WORKOUTS],
};

export { BODY_MEASUREMENTS, EXERCISES, GYM_SESSIONS, HEART_RATE_SAMPLES, PERSONAL_RECORDS, RACE_RESULTS, RACES_REGISTERED, ROUTINE_WORKOUTS, ROUTINES, RUNNING_ROUTES, SLEEP_LOGS, STEP_LOGS, SUPPLEMENTS_LOG, TRAINING_BLOCKS, TRAINING_PLAN_TEMPLATES, WATER_INTAKE_LOGS, WEIGHT_LOGS, WORKOUT_EXERCISES, WORKOUTS };
