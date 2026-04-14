export interface ProductivityRelationDefinition {
  collectionName: string;
}

export interface ProductivityFieldDefinition {
  name: string;
  type: "text" | "number" | "boolean" | "json" | "select" | "relation" | "date" | "email" | "file";
  required?: boolean;
  options?: string[];
  relation?: ProductivityRelationDefinition;
}

export interface ProductivityIndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface ProductivityCollectionDefinition {
  name: string;
  displayName: string;
  coreFieldNames: string[];
  fields: ProductivityFieldDefinition[];
  indexes: ProductivityIndexDefinition[];
}

export const PRODUCTIVITY_COLLECTION_DEFINITIONS: ProductivityCollectionDefinition[] = [
  {
    name: "people",
    displayName: "People",
    coreFieldNames: ["displayName", "kind"],
    fields: [
      { name: "displayName", type: "text", required: true },
      { name: "kind", type: "select", required: true, options: ["human", "agent", "org"] },
      { name: "identities", type: "json" },
      { name: "emails", type: "json" },
      { name: "phones", type: "json" },
      { name: "handles", type: "json" },
      { name: "role", type: "text" },
      { name: "organization", type: "text" },
    ],
    indexes: [{ name: "people_display_name_idx", fields: ["displayName"] }],
  },
  {
    name: "tasks",
    displayName: "Tasks",
    coreFieldNames: ["title", "status"],
    fields: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "status", type: "select", required: true, options: ["todo", "in_progress", "blocked", "done", "cancelled"] },
      { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
      { name: "labels", type: "json" },
      { name: "assigneePersonId", type: "relation", relation: { collectionName: "people" } },
      { name: "watcherPersonIds", type: "json" },
      { name: "dueAt", type: "date" },
      { name: "scheduledEventId", type: "relation", relation: { collectionName: "events" } },
      { name: "eventId", type: "relation", relation: { collectionName: "events" } },
      { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
      { name: "goalId", type: "relation", relation: { collectionName: "goals" } },
      { name: "parentTaskId", type: "relation", relation: { collectionName: "tasks" } },
      { name: "childTaskIds", type: "json" },
      { name: "dependsOnTaskIds", type: "json" },
      { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
      { name: "portfolioId", type: "relation", relation: { collectionName: "portfolios" } },
      { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
      { name: "checklist", type: "json" },
    ],
    indexes: [
      { name: "tasks_status_idx", fields: ["status"] },
      { name: "tasks_project_idx", fields: ["projectId"] },
      { name: "tasks_goal_idx", fields: ["goalId"] },
    ],
  },
  {
    name: "goals",
    displayName: "Goals",
    coreFieldNames: ["title", "status"],
    fields: [
      { name: "title", type: "text", required: true },
      { name: "status", type: "select", required: true, options: ["active", "paused", "done"] },
      { name: "description", type: "text" },
      { name: "level", type: "select", options: ["company", "team", "personal"] },
      { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
      { name: "parentId", type: "relation", relation: { collectionName: "goals" } },
      { name: "parentGoalId", type: "relation", relation: { collectionName: "goals" } },
      { name: "ownerPersonId", type: "relation", relation: { collectionName: "people" } },
      { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
      { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
      { name: "portfolioId", type: "relation", relation: { collectionName: "portfolios" } },
      { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
      { name: "metricKey", type: "text" },
      { name: "metricLabel", type: "text" },
      { name: "targetValue", type: "number" },
      { name: "currentValue", type: "number" },
      { name: "unit", type: "text" },
      { name: "period", type: "text" },
      { name: "healthStatus", type: "select", options: ["green", "yellow", "red", "unknown"] },
    ],
    indexes: [
      { name: "goals_status_idx", fields: ["status"] },
      { name: "goals_project_idx", fields: ["projectId"] },
      { name: "goals_company_idx", fields: ["companyId"] },
    ],
  },
  {
    name: "projects",
    displayName: "Projects",
    coreFieldNames: ["name", "status"],
    fields: [
      { name: "name", type: "text", required: true },
      { name: "status", type: "select", required: true, options: ["draft", "in_progress", "paused", "done", "archived"] },
      { name: "description", type: "text" },
      { name: "goalId", type: "relation", relation: { collectionName: "goals" } },
      { name: "ownerPersonId", type: "relation", relation: { collectionName: "people" } },
      { name: "leadAgentId", type: "relation", relation: { collectionName: "company_agents" } },
      { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
      { name: "portfolioId", type: "relation", relation: { collectionName: "portfolios" } },
      { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
      { name: "color", type: "text" },
      { name: "kind", type: "select", options: ["delivery", "growth", "ops", "research", "migration", "other"] },
      { name: "healthStatus", type: "select", options: ["green", "yellow", "red", "unknown"] },
      { name: "targetDate", type: "date" },
      { name: "startDate", type: "date" },
    ],
    indexes: [
      { name: "projects_status_idx", fields: ["status"] },
      { name: "projects_goal_idx", fields: ["goalId"] },
      { name: "projects_company_idx", fields: ["companyId"] },
    ],
  },
  {
    name: "events",
    displayName: "Events",
    coreFieldNames: ["title", "startsAt"],
    fields: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "startsAt", type: "date", required: true },
      { name: "endsAt", type: "date" },
      { name: "location", type: "text" },
      { name: "attendeePersonIds", type: "json" },
      { name: "linkedTaskIds", type: "json" },
      { name: "linkedNoteIds", type: "json" },
      { name: "reminders", type: "json" },
    ],
    indexes: [{ name: "events_starts_at_idx", fields: ["startsAt"] }],
  },
  {
    name: "reminders",
    displayName: "Reminders",
    coreFieldNames: ["title", "status", "triggerAt"],
    fields: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "status", type: "select", required: true, options: ["active", "paused", "done", "cancelled"] },
      { name: "triggerAt", type: "date", required: true },
      { name: "anchorType", type: "select", options: ["task", "project", "goal", "event", "thread", "standalone"] },
      { name: "anchorId", type: "text" },
      { name: "channel", type: "text" },
    ],
    indexes: [
      { name: "reminders_status_idx", fields: ["status"] },
      { name: "reminders_anchor_idx", fields: ["anchorType", "anchorId"] },
      { name: "reminders_trigger_at_idx", fields: ["triggerAt"] },
    ],
  },
  {
    name: "deadlines",
    displayName: "Deadlines",
    coreFieldNames: ["title", "status", "dueAt"],
    fields: [
      { name: "title", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "status", type: "select", required: true, options: ["active", "paused", "done", "cancelled"] },
      { name: "dueAt", type: "date", required: true },
      { name: "anchorType", type: "select", options: ["task", "project", "goal", "event", "thread", "standalone"] },
      { name: "anchorId", type: "text" },
    ],
    indexes: [
      { name: "deadlines_status_idx", fields: ["status"] },
      { name: "deadlines_anchor_idx", fields: ["anchorType", "anchorId"] },
      { name: "deadlines_due_at_idx", fields: ["dueAt"] },
    ],
  },
  {
    name: "notes",
    displayName: "Notes",
    coreFieldNames: ["title", "searchText"],
    fields: [
      { name: "title", type: "text", required: true },
      { name: "blocks", type: "json" },
      { name: "tags", type: "json" },
      { name: "summary", type: "text" },
      { name: "attachments", type: "json" },
      { name: "linkedEntityIds", type: "json" },
      { name: "searchText", type: "text", required: true },
    ],
    indexes: [{ name: "notes_title_idx", fields: ["title"] }],
  },
  {
    name: "inbox_threads",
    displayName: "Inbox Threads",
    coreFieldNames: ["channel", "status"],
    fields: [
      { name: "channel", type: "text", required: true },
      { name: "subject", type: "text" },
      { name: "externalThreadId", type: "text" },
      { name: "participantPersonIds", type: "json" },
      { name: "status", type: "select", required: true, options: ["unread", "read", "archived"] },
      { name: "replyTarget", type: "json" },
      { name: "linkedTaskIds", type: "json" },
      { name: "linkedNoteIds", type: "json" },
      { name: "latestMessageAt", type: "date" },
      { name: "preview", type: "text" },
    ],
    indexes: [
      { name: "inbox_threads_status_idx", fields: ["status"] },
      { name: "inbox_threads_channel_idx", fields: ["channel"] },
    ],
  },
  {
    name: "inbox_messages",
    displayName: "Inbox Messages",
    coreFieldNames: ["threadId", "channel", "status"],
    fields: [
      { name: "threadId", type: "relation", required: true, relation: { collectionName: "inbox_threads" } },
      { name: "channel", type: "text", required: true },
      { name: "externalThreadId", type: "text" },
      { name: "externalMessageId", type: "text" },
      { name: "participantPersonIds", type: "json" },
      { name: "direction", type: "select", required: true, options: ["inbound", "outbound", "system"] },
      { name: "status", type: "select", required: true, options: ["unread", "read", "archived", "draft", "sent", "failed"] },
      { name: "replyTarget", type: "json" },
      { name: "attachments", type: "json" },
      { name: "linkedTaskIds", type: "json" },
      { name: "linkedNoteIds", type: "json" },
      { name: "content", type: "text", required: true },
    ],
    indexes: [
      { name: "inbox_messages_thread_idx", fields: ["threadId"] },
      { name: "inbox_messages_status_idx", fields: ["status"] },
    ],
  },
];
