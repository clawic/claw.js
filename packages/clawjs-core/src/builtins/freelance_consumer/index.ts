import type { BuiltinFamilyDefinition } from "../_types.ts";
import { FREELANCE_CLIENTS } from "./freelance_clients.ts";
import { FREELANCE_INVOICES } from "./freelance_invoices.ts";
import { TIME_ENTRIES } from "./time_entries.ts";
import { BILLABLE_EXPENSES } from "./billable_expenses.ts";
import { CONTRACTS_FREELANCE } from "./contracts_freelance.ts";

export const FREELANCE_CONSUMER_FAMILY: BuiltinFamilyDefinition = {
  name: "freelance_consumer",
  displayName: "Freelance (Consumer Side)",
  description: "Clients you bill as a freelancer, invoices, time entries, expenses.",
  collections: [FREELANCE_CLIENTS, FREELANCE_INVOICES, TIME_ENTRIES, BILLABLE_EXPENSES, CONTRACTS_FREELANCE],
};

export { FREELANCE_CLIENTS, FREELANCE_INVOICES, TIME_ENTRIES, BILLABLE_EXPENSES, CONTRACTS_FREELANCE };
