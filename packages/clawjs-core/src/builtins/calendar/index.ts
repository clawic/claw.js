import type { BuiltinFamilyDefinition } from "../_types.ts";

import { BOOKING_MEETING_TYPES } from "./booking_meeting_types.ts";
import { AVAILABILITY_WINDOWS } from "./availability_windows.ts";
import { BOOKING_SLOTS } from "./booking_slots.ts";

export const CALENDAR_FAMILY: BuiltinFamilyDefinition = {
  name: "calendar",
  displayName: "Calendar & Bookings",
  description: "Bookable meeting types, availability windows and confirmed booking slots.",
  collections: [
    BOOKING_MEETING_TYPES,
    AVAILABILITY_WINDOWS,
    BOOKING_SLOTS,
  ],
};

export { BOOKING_MEETING_TYPES, AVAILABILITY_WINDOWS, BOOKING_SLOTS };
