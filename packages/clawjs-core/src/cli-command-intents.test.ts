import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CLAW_CLI_COMMAND_INTENT_STATUSES,
  commandIntentToNeedOpportunity,
  listClawCliCommandIntentRegistry,
  resolveClawCliCommandIntent,
} from "./catalogs.ts";

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
  assert.equal(intents.some((entry) => entry.id === "cmd_intent_runtime_portal" && entry.mappedCommand === "runtime <runtime-id>"), true);
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

test("CLI command intent resolution treats routed command aliases as covered", () => {
  const template = resolveClawCliCommandIntent({ phrase: "template list" });
  assert.equal(template.status, "covered");
  assert.equal(template.execute, false);
  assert.equal(template.intent.mappedCommand, "templates");
  assert.equal(template.intent.relatedCommands.includes("template"), true);
  assert.equal(template.intent.evidence.some((entry) => entry.includes("registered command alias `template`")), true);

  const style = resolveClawCliCommandIntent({ phrase: "style list" });
  assert.equal(style.status, "covered");
  assert.equal(style.intent.mappedCommand, "styles");

  const ref = resolveClawCliCommandIntent({ phrase: "ref list" });
  assert.equal(ref.status, "covered");
  assert.equal(ref.intent.mappedCommand, "references");

  const image = resolveClawCliCommandIntent({ phrase: "image list" });
  assert.equal(image.status, "covered");
  assert.equal(image.intent.mappedCommand, "images");
  assert.equal(image.intent.risk.includes("cost"), true);
});

test("CLI command intent resolution covers runtime ecosystem portal actions", () => {
  const portal = resolveClawCliCommandIntent({ phrase: "runtime ecosystem portal" });
  assert.equal(portal.status, "covered");
  assert.equal(portal.execute, false);
  assert.equal(portal.intent.mappedCommand, "runtime <runtime-id>");
  assert.equal(portal.intent.relatedCommands.includes("openclaw"), true);

  const domains = resolveClawCliCommandIntent({ phrase: "runtime domains" });
  assert.equal(domains.status, "covered");
  assert.equal(domains.execute, false);
  assert.equal(domains.intent.mappedCommand, "runtime <runtime-id> domains");
  assert.equal(domains.intent.evidence.some((entry) => entry.includes("manifest-exact domains")), true);

  const support = resolveClawCliCommandIntent({ phrase: "runtime support" });
  assert.equal(support.status, "covered");
  assert.equal(support.execute, false);
  assert.equal(support.intent.mappedCommand, "runtime <runtime-id> support");
  assert.equal(support.intent.evidence.some((entry) => entry.includes("evidence requirements")), true);

  const resources = resolveClawCliCommandIntent({ phrase: "runtime resources" });
  assert.equal(resources.status, "covered");
  assert.equal(resources.execute, false);
  assert.equal(resources.intent.mappedCommand, "runtime <runtime-id> resources <domain>");
  assert.equal(resources.intent.evidence.some((entry) => entry.includes("explicit valid manifest domain")), true);

  const domain = resolveClawCliCommandIntent({ phrase: "runtime domain" });
  assert.equal(domain.status, "covered");
  assert.equal(domain.execute, false);
  assert.equal(domain.intent.mappedCommand, "runtime <runtime-id> domain <domain>");
  assert.equal(domain.intent.evidence.some((entry) => entry.includes("stable JSON usage errors")), true);

  const preview = resolveClawCliCommandIntent({ phrase: "runtime sessions preview" });
  assert.equal(preview.status, "covered");
  assert.equal(preview.execute, false);
  assert.equal(preview.intent.mappedCommand, "runtime <runtime-id> sessions preview");
  assert.equal(preview.intent.evidence.some((entry) => entry.includes("bounded local session-path preview")), true);

  const resolve = resolveClawCliCommandIntent({ phrase: "runtime sessions resolve" });
  assert.equal(resolve.status, "covered");
  assert.equal(resolve.execute, false);
  assert.equal(resolve.intent.mappedCommand, "runtime <runtime-id> sessions resolve");
  assert.equal(resolve.intent.evidence.some((entry) => entry.includes("without reading transcript content")), true);

  const history = resolveClawCliCommandIntent({ phrase: "runtime sessions history" });
  assert.equal(history.status, "covered");
  assert.equal(history.execute, false);
  assert.equal(history.intent.mappedCommand, "runtime <runtime-id> sessions history");
  assert.equal(history.intent.evidence.some((entry) => entry.includes("metadata-only default")), true);

  const send = resolveClawCliCommandIntent({ phrase: "runtime sessions send" });
  assert.equal(send.status, "covered");
  assert.equal(send.execute, false);
  assert.equal(send.intent.mappedCommand, "runtime openclaw sessions send");
  assert.equal(send.intent.risk.includes("local_write"), true);
  assert.equal(send.intent.nextSteps.some((entry) => entry.includes("--confirm-runtime-write")), true);

  const inject = resolveClawCliCommandIntent({ phrase: "runtime sessions inject" });
  assert.equal(inject.status, "covered");
  assert.equal(inject.execute, false);
  assert.equal(inject.intent.mappedCommand, "runtime openclaw sessions inject");
  assert.equal(inject.intent.risk.includes("local_write"), true);
  assert.equal(inject.intent.nextSteps.some((entry) => entry.includes("--confirm-runtime-write")), true);

  const abort = resolveClawCliCommandIntent({ phrase: "runtime sessions abort" });
  assert.equal(abort.status, "covered");
  assert.equal(abort.execute, false);
  assert.equal(abort.intent.mappedCommand, "runtime openclaw sessions abort");
  assert.equal(abort.intent.risk.includes("external_service"), true);
  assert.equal(abort.intent.nextSteps.some((entry) => entry.includes("runtime control action")), true);

  const create = resolveClawCliCommandIntent({ phrase: "runtime sessions create" });
  assert.equal(create.status, "blocked");
  assert.equal(create.execute, false);
  assert.equal(create.intent.mappedCommand, "runtime <runtime-id> sessions create");
  assert.equal(create.intent.risk.includes("local_write"), true);
  assert.equal(create.intent.evidence.some((entry) => entry.includes("non-mutating create plan")), true);

  const pin = resolveClawCliCommandIntent({ phrase: "runtime sessions pin" });
  assert.equal(pin.status, "covered");
  assert.equal(pin.execute, false);
  assert.equal(pin.intent.mappedCommand, "runtime <runtime-id> sessions pin");
  assert.equal(pin.intent.evidence.some((entry) => entry.includes("writesRuntime: false")), true);

  const unpin = resolveClawCliCommandIntent({ phrase: "runtime sessions unpin" });
  assert.equal(unpin.status, "covered");
  assert.equal(unpin.execute, false);
  assert.equal(unpin.intent.mappedCommand, "runtime <runtime-id> sessions unpin");
  assert.equal(unpin.intent.nextSteps.some((entry) => entry.includes("host app-state projection")), true);

  const conflicts = resolveClawCliCommandIntent({ phrase: "runtime sessions conflicts" });
  assert.equal(conflicts.status, "covered");
  assert.equal(conflicts.execute, false);
  assert.equal(conflicts.intent.mappedCommand, "runtime <runtime-id> sessions conflicts");
  assert.equal(conflicts.intent.risk.includes("local_read"), true);
  assert.equal(conflicts.intent.evidence.some((entry) => entry.includes("no_silent_overwrite")), true);
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
