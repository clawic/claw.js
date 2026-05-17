import type { BuiltinFamilyDefinition } from "../_types.ts";

import { WORK_ORDERS } from "./work_orders.ts";

export const MANUFACTURING_FAMILY: BuiltinFamilyDefinition = {
  name: "manufacturing",
  displayName: "Manufacturing / MES",
  description: "Manufacturing work orders, operations, materials, equipment links, quality checks, and evidence.",
  collections: [
    WORK_ORDERS,
  ],
};

export { WORK_ORDERS };
