import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TIME_OFF_REQUESTS: BuiltinCollectionDefinition = {
  name: "time_off_requests",
  displayName: "Time Off Requests",
  family: "hr",
  aliases: ["pto","time_off","time_off_request","time_off_requests"],
  fields: [
    { name: "employeeId", type: "relation", required: true, relation: { collectionName: "employees" } },
    { name: "kind", type: "select", options: ["vacation","sick","parental","bereavement","unpaid","sabbatical","jury_duty","other"] },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "daysRequested", type: "number" },
    { name: "status", type: "select", options: ["pending","approved","rejected","cancelled"] },
    { name: "notes", type: "text" },
    { name: "approverEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "decidedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "tor_emp_idx", fields: ["employeeId"] },
    { name: "tor_status_idx", fields: ["status"] },
  ],
};
