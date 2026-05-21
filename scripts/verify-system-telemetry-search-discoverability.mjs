export function assertSearchDiscoverability({ parseCliPayload, claw, assert }) {
  const telemetry = parseCliPayload(claw(["search", "system telemetry", "--json"]), "search system telemetry");
  const telemetryResults = telemetry.results ?? [];
  assert(telemetryResults.some((result) => result.type === "doc" && result.path === "docs/cli.md" && String(result.summary ?? "").includes("System Telemetry")), "search system telemetry: missing CLI docs result");

  const systemCommand = parseCliPayload(claw(["search", "system", "--json"]), "search system");
  const systemCommandResults = systemCommand.results ?? [];
  assert(systemCommandResults.some((result) => result.type === "command" && result.name === "system"), "search system: missing system command result");

  for (const query of ["system telemetry metrics", "system telemetry widgets", "system telemetry control plan"]) {
    const commandSearch = parseCliPayload(claw(["search", query, "--json"]), `search ${query}`);
    const commandResults = commandSearch.results ?? commandSearch.items ?? [];
    assert(commandResults.some((result) => result.canonicalName === "system" && result.type === "alias" && result.name === query), `search ${query}: missing exact system command discovery alias`);
  }

  const menuBar = parseCliPayload(claw(["search", "menu bar indicators", "--json"]), "search menu bar indicators");
  const menuBarResults = menuBar.results ?? [];
  assert(menuBarResults.some((result) => result.path === "docs/cli.md"), "search menu bar indicators: missing CLI docs result");
  assert(menuBarResults.some((result) => String(result.summary ?? "").includes("clawix.menuBarSystemIndicators")), "search menu bar indicators: missing menu bar route evidence");

  const credentialRedaction = parseCliPayload(claw(["search", "system telemetry provider credential redaction", "--json"]), "search provider credential redaction");
  const credentialRedactionResults = credentialRedaction.results ?? [];
  assert(credentialRedactionResults.some((result) => result.path === "docs/cli.md" && String(result.summary ?? "").includes("provided_redacted")), "search provider credential redaction: missing CLI redaction contract");

  const sdkTelemetry = parseCliPayload(claw(["search", "system telemetry SDK custom app", "--json"]), "search system telemetry SDK custom app");
  const sdkTelemetryResults = sdkTelemetry.results ?? [];
  assert(sdkTelemetryResults.some((result) => result.path === "docs/cli.md" && String(result.summary ?? "").includes("System telemetry SDK custom-app contracts")), "search system telemetry SDK custom app: missing CLI SDK contract docs");

  const decisionMatrix = parseCliPayload(claw(["search", "system telemetry decision matrix", "--json"]), "search system telemetry decision matrix");
  const decisionMatrixResults = decisionMatrix.results ?? [];
  assert(decisionMatrixResults.some((result) => result.path === "docs/governance/system-telemetry/decision-matrix.md"), "search system telemetry decision matrix: missing decision matrix doc");

  const externalLedger = parseCliPayload(claw(["search", "system telemetry external pending validation", "--json"]), "search system telemetry external pending validation");
  const externalLedgerResults = externalLedger.results ?? [];
  assert(externalLedgerResults.some((result) => result.path === "docs/governance/system-telemetry/external-pending.md"), "search system telemetry external pending validation: missing external-pending ledger doc");

  const route = parseCliPayload(claw(["inspect", "route", "system.telemetryAgentContext", "--json"]), "inspect credential redaction route");
  assert(route.edges?.some((edge) => edge.id === "claw.edge.system.telemetry.consumes.contextProviders" && String(edge.transport ?? "").includes("provided_redacted credential projection")), "inspect route: provider edge must expose credential redaction projection");

}
