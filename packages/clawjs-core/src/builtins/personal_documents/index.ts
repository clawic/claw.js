import type { BuiltinFamilyDefinition } from "../_types.ts";
import { IDENTITY_DOCUMENTS } from "./identity_documents.ts";
import { INSURANCE_POLICIES } from "./insurance_policies.ts";
import { CONTRACTS_PERSONAL } from "./contracts_personal.ts";
import { DEEDS_TITLES } from "./deeds_titles.ts";
import { IMPORTANT_RECEIPTS } from "./important_receipts.ts";
import { GENERAL_PERSONAL_DOCUMENTS } from "./general_personal_documents.ts";
import { EMERGENCY_CONTACTS } from "./emergency_contacts.ts";
import { LEGAL_DOCUMENTS } from "./legal_documents.ts";

export const PERSONAL_DOCUMENTS_FAMILY: BuiltinFamilyDefinition = {
  name: "personal_documents",
  displayName: "Personal Documents",
  description: "IDs, passports, insurance, contracts, deeds, receipts, emergency contacts.",
  collections: [IDENTITY_DOCUMENTS, INSURANCE_POLICIES, CONTRACTS_PERSONAL, DEEDS_TITLES, IMPORTANT_RECEIPTS, GENERAL_PERSONAL_DOCUMENTS, EMERGENCY_CONTACTS, LEGAL_DOCUMENTS],
};

export { IDENTITY_DOCUMENTS, INSURANCE_POLICIES, CONTRACTS_PERSONAL, DEEDS_TITLES, IMPORTANT_RECEIPTS, GENERAL_PERSONAL_DOCUMENTS, EMERGENCY_CONTACTS, LEGAL_DOCUMENTS };
