import type { BuiltinFamilyDefinition } from "../_types.ts";

import { CUSTOMER_TIERS } from "./customer_tiers.ts";
import { CUSTOMERS } from "./customers.ts";
import { CUSTOMER_REQUESTS } from "./customer_requests.ts";
import { TRIAGE_RESPONSIBILITIES } from "./triage_responsibilities.ts";
import { INTAKE_ADDRESSES } from "./intake_addresses.ts";
import { WEB_FORM_SUBMISSIONS } from "./web_form_submissions.ts";

export const CUSTOMER_INTAKE_FAMILY: BuiltinFamilyDefinition = {
  name: "customer_intake",
  displayName: "Customer Intake & Triage",
  description: "Customers, customer requests linked to issues, tiers, triage rotations and intake channels.",
  collections: [
    CUSTOMER_TIERS,
    CUSTOMERS,
    CUSTOMER_REQUESTS,
    TRIAGE_RESPONSIBILITIES,
    INTAKE_ADDRESSES,
    WEB_FORM_SUBMISSIONS,
  ],
};

export { CUSTOMER_TIERS, CUSTOMERS, CUSTOMER_REQUESTS, TRIAGE_RESPONSIBILITIES, INTAKE_ADDRESSES, WEB_FORM_SUBMISSIONS };
