import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentInstructions, buildIssuePrompt } from "./company-claw.ts";
import type { CompanyAgent, Issue, IssueComment } from "./company-types.ts";

test("buildAgentInstructions includes role, title, capabilities and goals", () => {
  const md = buildAgentInstructions({
    company: { name: "Acme", description: "Robots", issuePrefix: "ACM" },
    agent: {
      name: "Ada",
      role: "cto",
      title: "Chief Technology Officer",
      capabilities: "Owns architecture and delivery.",
    },
    reportsToTitle: "Chief Executive Officer",
    goalTitles: ["Launch v1", "Hire 3 engineers"],
  });
  assert.match(md, /# Chief Technology Officer \(cto\)/);
  assert.match(md, /\*\*Ada\*\*/);
  assert.match(md, /\*\*Acme\*\*/);
  assert.match(md, /Owns architecture and delivery\./);
  assert.match(md, /- Launch v1/);
  assert.match(md, /- Hire 3 engineers/);
  assert.match(md, /Chief Executive Officer/);
  assert.match(md, /ACM-1/);
  assert.match(md, /STATUS:/);
});

test("buildAgentInstructions falls back to board reporting when no manager", () => {
  const md = buildAgentInstructions({
    company: { name: "Acme", issuePrefix: "ACM" },
    agent: { name: "Ada", role: "cto", title: "CTO" },
  });
  assert.match(md, /report directly to the board/);
  assert.match(md, /No active company goals yet/);
});

test("buildIssuePrompt includes header, description and prior comments", () => {
  const agent = { id: "agent-1", name: "Ada", role: "cto", title: "CTO" } as CompanyAgent;
  const issue = {
    id: "issue-1",
    identifier: "ACM-7",
    title: "Decide on database engine",
    description: "We need to commit to one OLTP store this week.",
    status: "todo",
    priority: "high",
  } as Issue;
  const comments = [
    { body: "We are looking at Postgres and MySQL.", authorAgentId: "ceo-1" } as IssueComment,
  ];
  const prompt = buildIssuePrompt({ issue, comments, agent });
  assert.match(prompt, /# Issue ACM-7: Decide on database engine/);
  assert.match(prompt, /Status: todo/);
  assert.match(prompt, /Priority: high/);
  assert.match(prompt, /We need to commit/);
  assert.match(prompt, /Postgres and MySQL/);
  assert.match(prompt, /Your task/);
});
