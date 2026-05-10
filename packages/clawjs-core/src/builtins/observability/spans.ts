import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SPANS: BuiltinCollectionDefinition = {
  name: "spans",
  displayName: "Spans (Distributed Tracing)",
  family: "observability",
  aliases: ["span","spans","trace","traces"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "traceId", type: "text", required: true },
    { name: "spanId", type: "text", required: true },
    { name: "parentSpanId", type: "text" },
    { name: "service", type: "text" },
    { name: "operation", type: "text" },
    { name: "startTime", type: "date" },
    { name: "durationMs", type: "number" },
    { name: "status", type: "select", options: ["ok","error","timeout","cancelled"] },
    { name: "tags", type: "json" },
    { name: "events", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "spans_trace_idx", fields: ["traceId"] },
    { name: "spans_company_service_idx", fields: ["companyId","service"] },
  ],
};
