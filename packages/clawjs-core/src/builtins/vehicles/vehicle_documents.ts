import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLE_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "vehicle_documents",
  displayName: "Vehicle Documents",
  family: "vehicles",
  aliases: ["vehicle_document","vehicle_documents"],
  fields: [
    { name: "vehicleId", type: "relation", required: true, relation: { collectionName: "vehicles" } },
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["registration","inspection","ownership","service_record","fine","other"] },
    { name: "documentDate", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vehicle_documents_vehicle_idx", fields: ["vehicleId"] },
    { name: "vehicle_documents_expires_idx", fields: ["expiresAt"] },
  ],
};
