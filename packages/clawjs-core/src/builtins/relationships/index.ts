import type { BuiltinFamilyDefinition } from "../_types.ts";
import { PERSONAL_CONTACTS } from "./personal_contacts.ts";
import { PERSONAL_RELATIONSHIPS } from "./personal_relationships.ts";
import { BIRTHDAYS } from "./birthdays.ts";
import { IMPORTANT_DATES } from "./important_dates.ts";
import { GIFTS_GIVEN } from "./gifts_given.ts";
import { GIFTS_RECEIVED } from "./gifts_received.ts";
import { GIFT_IDEAS } from "./gift_ideas.ts";

export const RELATIONSHIPS_FAMILY: BuiltinFamilyDefinition = {
  name: "relationships",
  displayName: "Relationships",
  description: "Personal contacts, birthdays, gifts, important dates.",
  collections: [PERSONAL_CONTACTS, PERSONAL_RELATIONSHIPS, BIRTHDAYS, IMPORTANT_DATES, GIFTS_GIVEN, GIFTS_RECEIVED, GIFT_IDEAS],
};

export { PERSONAL_CONTACTS, PERSONAL_RELATIONSHIPS, BIRTHDAYS, IMPORTANT_DATES, GIFTS_GIVEN, GIFTS_RECEIVED, GIFT_IDEAS };
