import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CLAW_CLI_COMMAND_INTENT_STATUSES,
  commandIntentToNeedOpportunity,
  listClawCliCommandIntentRegistry,
  resolveClawCliCommandIntent,
} from "./index.ts";

test("CLI command intents expose the compact V1 status model", () => {
  assert.deepEqual(CLAW_CLI_COMMAND_INTENT_STATUSES, [
    "covered",
    "candidate_alias",
    "gap",
    "future",
    "blocked",
    "external_pending",
  ]);
  const intents = listClawCliCommandIntentRegistry();
  assert.equal(intents.some((entry) => entry.id === "cmd_intent_house_buy" && entry.status === "future"), true);
  assert.equal(intents.some((entry) => entry.status === "blocked"), true);
  assert.equal(intents.some((entry) => entry.status === "external_pending"), true);
});

test("CLI command intent resolution is deterministic and non-executing", () => {
  const covered = resolveClawCliCommandIntent({ phrase: "claw tasks list" });
  assert.equal(covered.status, "covered");
  assert.equal(covered.execute, false);
  assert.equal(covered.intent.mappedCommand, "tasks");

  const future = resolveClawCliCommandIntent({ phrase: "house buy" });
  assert.equal(future.status, "future");
  assert.equal(future.execute, false);
  assert.equal(future.intent.reportTarget, "github_discussions_ideas");
  assert.equal(future.intent.risk.includes("cost"), true);

  const typo = resolveClawCliCommandIntent({ phrase: "peopel" });
  assert.equal(typo.status, "candidate_alias");
  assert.equal(typo.related.some((entry) => entry.canonicalName === "people"), true);
});

test("CLI command intent resolution understands dense-data direct nouns without executing them", () => {
  const patientList = resolveClawCliCommandIntent({ phrase: "claw patient list" });
  assert.equal(patientList.status, "covered");
  assert.equal(patientList.execute, false);
  assert.equal(patientList.intent.mappedCommand, "patient");
  assert.equal(patientList.intent.relatedCommands.includes("health"), true);
  assert.equal(patientList.intent.evidence.some((entry) => entry.includes("patient")), true);

  const medicationAdd = resolveClawCliCommandIntent({ phrase: "claw medication add --patient p_123" });
  assert.equal(medicationAdd.status, "candidate_alias");
  assert.equal(medicationAdd.execute, false);
  assert.equal(medicationAdd.intent.mappedCommand, "health");
  assert.equal(medicationAdd.intent.evidence.some((entry) => entry.includes("operation=patient.medication.add")), true);

  const invoiceList = resolveClawCliCommandIntent({ phrase: "claw invoice list" });
  assert.equal(invoiceList.status, "covered");
  assert.equal(invoiceList.intent.mappedCommand, "erp");
  assert.equal(invoiceList.intent.evidence.some((entry) => entry.includes("operation=invoice.list")), true);
});

test("CLI command intent resolution covers audited collection aliases as top-level commands", () => {
  const leadList = resolveClawCliCommandIntent({ phrase: "claw lead list" });
  assert.equal(leadList.status, "covered");
  assert.equal(leadList.execute, false);
  assert.equal(leadList.intent.mappedCommand, "db leads list");
  assert.equal(leadList.intent.relatedCommands.includes("leads"), true);
  assert.equal(leadList.intent.evidence.some((entry) => entry.includes("built-in collection alias")), true);

  const supportTicketCreate = resolveClawCliCommandIntent({ phrase: "ticket create" });
  assert.equal(supportTicketCreate.status, "covered");
  assert.equal(supportTicketCreate.intent.mappedCommand, "db support_tickets create");
  assert.equal(supportTicketCreate.intent.risk.includes("local_write"), true);

  const transportList = resolveClawCliCommandIntent({ phrase: "transport list" });
  assert.equal(transportList.status, "covered");
  assert.equal(transportList.intent.mappedCommand, "db transports_booked list");
  assert.equal(transportList.intent.evidence.some((entry) => entry.includes("transports_booked")), true);

  const leadUnknownAction = resolveClawCliCommandIntent({ phrase: "lead merge" });
  assert.notEqual(leadUnknownAction.status, "covered");
});

test("CLI command intents produce Need-compatible opportunities for unresolved demand", () => {
  const future = resolveClawCliCommandIntent({ phrase: "house buy" }).intent;
  const opportunity = commandIntentToNeedOpportunity(future);
  assert.equal(opportunity?.routeId, "cli.commandIntentResolution");
  assert.equal(opportunity?.source, "known_discovery_gap");
  assert.equal(opportunity?.affectedSurfaces.includes("claw.cli.command.commands"), true);
});
