import type { BuiltinFamilyDefinition } from "../_types.ts";

import { CARRIERS } from "./carriers.ts";
import { FREIGHT_RATES } from "./freight_rates.ts";
import { SHIPMENT_LEGS } from "./shipment_legs.ts";
import { SHIPMENTS } from "./shipments.ts";

export const TRANSPORT_FAMILY: BuiltinFamilyDefinition = {
  name: "transport",
  displayName: "Transport / TMS",
  description: "Carriers, shipments, shipment legs, freight rates, evidence, and gaps for transport management.",
  collections: [
    CARRIERS,
    SHIPMENTS,
    SHIPMENT_LEGS,
    FREIGHT_RATES,
  ],
};

export { CARRIERS, FREIGHT_RATES, SHIPMENT_LEGS, SHIPMENTS };
