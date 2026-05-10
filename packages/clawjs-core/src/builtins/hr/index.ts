import type { BuiltinFamilyDefinition } from "../_types.ts";

import { DEPARTMENTS } from "./departments.ts";
import { EMPLOYEES } from "./employees.ts";
import { CONTRACTORS } from "./contractors.ts";
import { PAYROLL_RUNS } from "./payroll_runs.ts";
import { PAY_STUBS } from "./pay_stubs.ts";
import { TIME_OFF_REQUESTS } from "./time_off_requests.ts";
import { BENEFITS_ENROLLMENTS } from "./benefits_enrollments.ts";
import { PERFORMANCE_REVIEWS } from "./performance_reviews.ts";
import { ONE_ON_ONES } from "./one_on_ones.ts";
import { PRAISE } from "./praise.ts";
import { ENGAGEMENT_SURVEYS } from "./engagement_surveys.ts";
import { ENGAGEMENT_RESPONSES } from "./engagement_responses.ts";
import { OKRS } from "./okrs.ts";

export const HR_FAMILY: BuiltinFamilyDefinition = {
  name: "hr",
  displayName: "HR & People Ops",
  description: "Employees, contractors, payroll, time off, performance reviews, OKRs and recognition.",
  collections: [
    DEPARTMENTS,
    EMPLOYEES,
    CONTRACTORS,
    PAYROLL_RUNS,
    PAY_STUBS,
    TIME_OFF_REQUESTS,
    BENEFITS_ENROLLMENTS,
    PERFORMANCE_REVIEWS,
    ONE_ON_ONES,
    PRAISE,
    ENGAGEMENT_SURVEYS,
    ENGAGEMENT_RESPONSES,
    OKRS,
  ],
};

export { DEPARTMENTS, EMPLOYEES, CONTRACTORS, PAYROLL_RUNS, PAY_STUBS, TIME_OFF_REQUESTS, BENEFITS_ENROLLMENTS, PERFORMANCE_REVIEWS, ONE_ON_ONES, PRAISE, ENGAGEMENT_SURVEYS, ENGAGEMENT_RESPONSES, OKRS };
