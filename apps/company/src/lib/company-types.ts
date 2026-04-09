/**
 * Shared TypeScript types for the Company app.
 *
 * Mirrors the database service collections defined in
 * database/src/server/db.ts (companies, goals, projects, company_agents,
 * issues, issue_comments, approvals, runs).
 */

import type { DatabaseRecord } from "./database-client";

export type CompanyStatus = "active" | "archived";

export interface Company extends DatabaseRecord {
  name: string;
  issuePrefix: string;
  issueCounter: number;
  status: CompanyStatus;
  description?: string;
  brandColor?: string;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
  requireBoardApprovalForNewAgents?: boolean;
}

export type GoalLevel = "company" | "team" | "personal";
export type GoalStatus = "active" | "paused" | "done";

export interface Goal extends DatabaseRecord {
  companyId: string;
  title: string;
  level: GoalLevel;
  status: GoalStatus;
  description?: string;
  parentId?: string;
  ownerAgentId?: string;
}

export type ProjectStatus = "draft" | "in_progress" | "paused" | "done" | "archived";

export interface Project extends DatabaseRecord {
  companyId: string;
  name: string;
  status: ProjectStatus;
  goalId?: string;
  description?: string;
  leadAgentId?: string;
  color?: string;
}

export type CompanyAgentStatus = "pending_approval" | "active" | "paused" | "fired";
export type CompanyAgentAdapterType = "human" | "clawjs_local";

export interface CompanyAgent extends DatabaseRecord {
  companyId: string;
  name: string;
  role: string;
  title: string;
  status: CompanyAgentStatus;
  adapterType: CompanyAgentAdapterType;
  icon?: string;
  reportsTo?: string;
  capabilities?: string;
  adapterConfig?: Record<string, unknown>;
  instructionsMarkdown?: string;
  clawAppId?: string;
  clawWorkspaceId?: string;
  clawAgentId?: string;
  workspaceDir?: string;
}

export type IssueStatus = "todo" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export interface Issue extends DatabaseRecord {
  companyId: string;
  identifier: string;
  issueNumber: number;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  description?: string;
  projectId?: string;
  goalId?: string;
  parentId?: string;
  assigneeAgentId?: string;
  createdByAgentId?: string;
  createdByUserId?: string;
  executionRunId?: string;
}

export interface IssueComment extends DatabaseRecord {
  companyId: string;
  issueId: string;
  body: string;
  authorAgentId?: string;
  authorUserId?: string;
  createdByRunId?: string;
}

export type ApprovalType = "hire_agent" | "fire_agent" | "budget_change" | "policy_change";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval extends DatabaseRecord {
  companyId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  payload?: Record<string, unknown>;
  requestedByAgentId?: string;
  requestedByUserId?: string;
  decidedAt?: string;
  decidedByUserId?: string;
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Run extends DatabaseRecord {
  companyId: string;
  agentId: string;
  status: RunStatus;
  issueId?: string;
  clawSessionId?: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  metrics?: Record<string, unknown>;
}

export const LOCAL_BOARD_USER_ID = "local-board";
