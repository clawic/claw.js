import type { BuiltinFamilyDefinition } from "../_types.ts";
import { WORKOUTS } from "./workouts.ts";
import { WORKOUT_EXERCISES } from "./workout_exercises.ts";
import { EXERCISES } from "./exercises.ts";
import { ROUTINES } from "./routines.ts";
import { ROUTINE_WORKOUTS } from "./routine_workouts.ts";
import { WEIGHT_LOGS } from "./weight_logs.ts";
import { BODY_MEASUREMENTS } from "./body_measurements.ts";
import { WATER_INTAKE_LOGS } from "./water_intake_logs.ts";
import { SLEEP_LOGS } from "./sleep_logs.ts";
import { STEP_LOGS } from "./step_logs.ts";
import { HEART_RATE_SAMPLES } from "./heart_rate_samples.ts";
import { PERSONAL_RECORDS } from "./personal_records.ts";
import { RUNNING_ROUTES } from "./running_routes.ts";
import { GYM_SESSIONS } from "./gym_sessions.ts";

export const FITNESS_FAMILY: BuiltinFamilyDefinition = {
  name: "fitness",
  displayName: "Fitness & Body",
  description: "Workouts, exercises, body tracking, sleep, water, running routes.",
  collections: [WORKOUTS, WORKOUT_EXERCISES, EXERCISES, ROUTINES, ROUTINE_WORKOUTS, WEIGHT_LOGS, BODY_MEASUREMENTS, WATER_INTAKE_LOGS, SLEEP_LOGS, STEP_LOGS, HEART_RATE_SAMPLES, PERSONAL_RECORDS, RUNNING_ROUTES, GYM_SESSIONS],
};

export { WORKOUTS, WORKOUT_EXERCISES, EXERCISES, ROUTINES, ROUTINE_WORKOUTS, WEIGHT_LOGS, BODY_MEASUREMENTS, WATER_INTAKE_LOGS, SLEEP_LOGS, STEP_LOGS, HEART_RATE_SAMPLES, PERSONAL_RECORDS, RUNNING_ROUTES, GYM_SESSIONS };
