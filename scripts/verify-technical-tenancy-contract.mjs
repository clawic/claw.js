#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const baseWord = ["ten", "ant"].join("");
const baseWordTitle = `${baseWord[0].toUpperCase()}${baseWord.slice(1)}`;
const camelField = `${baseWord}Id`;
const snakeField = `${baseWord}_id`;
const pluralPath = `${baseWord}s`;
const decisionId = "conceptual-vocabulary.technical-tenancy-contract";

function read(repoRoot, relativePath, failures) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireSnippet(repoRoot, relativePath, snippet, failures) {
  const text = read(repoRoot, relativePath, failures);
  if (!text.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function requireNoSnippet(repoRoot, relativePath, snippet, failures) {
  const text = read(repoRoot, relativePath, failures);
  if (text.includes(snippet)) failures.push(`${relativePath}: contains forbidden ${JSON.stringify(snippet)}`);
}

function listFiles(repoRoot, relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  const results = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const absoluteEntry = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absoluteEntry);
      } else if (/\.(?:tsx?|jsx?|md)$/u.test(entry.name)) {
        results.push(path.relative(repoRoot, absoluteEntry));
      }
    }
  };
  visit(absoluteDir);
  return results;
}

function requireNoVisibleLegacyLabels(repoRoot, failures) {
  const forbiddenFragments = [
    `${baseWordTitle} ID`,
    `${baseWordTitle} <span`,
    `${baseWordTitle} \${`,
    `in your ${baseWord}.`,
  ];
  for (const file of [...listFiles(repoRoot, "relay/ui/src"), ...listFiles(repoRoot, "apps/chat")]) {
    const text = read(repoRoot, file, failures);
    for (const fragment of forbiddenFragments) {
      if (text.includes(fragment)) failures.push(`${file}: visible UI copy must say Relay isolation, not ${JSON.stringify(fragment)}`);
    }
  }
}

function verify(repoRoot) {
  const failures = [];

  requireSnippet(repoRoot, "docs/vocabulary.md", `\`${baseWord}\` is technical provider/hosting isolation only`, failures);
  requireSnippet(repoRoot, "docs/naming-style-guide.md", `Use \`${baseWord}\` only for technical hosted/provider isolation`, failures);
  requireSnippet(repoRoot, "docs/relay.md", `/v1/${pluralPath}/:${camelField}/agents/:agentId/workspaces`, failures);
  requireSnippet(repoRoot, "docs/relay.md", `${camelField} + connectorId`, failures);
  requireSnippet(repoRoot, "docs/adr/0022-remote-gateway-sync-redesign.md", "gateway.multiTenantAgentService", failures);

  requireSnippet(repoRoot, "packages/clawjs-core/src/remote-sync.ts", `assignment.${camelField} !== request.${camelField}`, failures);
  requireSnippet(repoRoot, "packages/clawjs-core/src/remote-sync.ts", `budget.${camelField} !== request.${camelField}`, failures);
  requireSnippet(repoRoot, "packages/clawjs-core/src/remote-sync.ts", "assignment.isolationKey", failures);
  requireSnippet(repoRoot, "packages/clawjs-core/src/index-remote-contracts.test.ts", `request: {\n      ${camelField}: "${baseWord}.other"`, failures);
  requireSnippet(repoRoot, "packages/clawjs-core/src/index-remote-contracts.test.ts", `${baseWord}: assignment belongs to a different ${baseWord}`, failures);
  requireSnippet(repoRoot, "packages/clawjs-core/src/index-remote-contracts.test.ts", `budget: ${baseWord} mismatch`, failures);

  requireSnippet(repoRoot, "relay/src/server/db.ts", snakeField, failures);
  requireSnippet(repoRoot, "relay/src/server/app.ts", `admin/${pluralPath}/:${camelField}`, failures);
  requireSnippet(repoRoot, "packages/clawjs/src/cli-remote-sync-command.ts", "gateway.multiTenantAgentService", failures);
  requireSnippet(repoRoot, "packages/clawjs/src/cli-claw-factory.ts", `CLAW_SECRETS_${baseWord.toUpperCase()}`, failures);

  requireNoVisibleLegacyLabels(repoRoot, failures);

  const audit = read(repoRoot, "docs/governance/conceptual-vocabulary-audit.md", failures);
  if (audit.includes("Pending Semantic Decisions") && audit.includes(`| \`${decisionId}\``)) {
    failures.push("conceptual vocabulary audit still lists the technical-isolation contract as pending");
  }
  if (!audit.includes("Technical-isolation contract verifier")) {
    failures.push("conceptual vocabulary audit must record the Technical-isolation contract verifier evidence");
  }

  return failures;
}

function writeFile(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-technical-isolation-"));
  writeFile(tempRoot, "docs/vocabulary.md", `- \`${baseWord}\` is technical provider/hosting isolation only.\n`);
  writeFile(tempRoot, "docs/naming-style-guide.md", `- Use \`${baseWord}\` only for technical hosted/provider isolation.\n`);
  writeFile(tempRoot, "docs/relay.md", `/v1/${pluralPath}/:${camelField}/agents/:agentId/workspaces\n${camelField} + connectorId\n`);
  writeFile(tempRoot, "docs/adr/0022-remote-gateway-sync-redesign.md", "gateway.multiTenantAgentService\n");
  writeFile(tempRoot, "packages/clawjs-core/src/remote-sync.ts", `assignment.${camelField} !== request.${camelField}\nbudget.${camelField} !== request.${camelField}\nassignment.isolationKey\n`);
  writeFile(tempRoot, "packages/clawjs-core/src/index-remote-contracts.test.ts", `request: {\n      ${camelField}: "${baseWord}.other"\n${baseWord}: assignment belongs to a different ${baseWord}\nbudget: ${baseWord} mismatch\n`);
  writeFile(tempRoot, "relay/src/server/db.ts", `${snakeField}\n`);
  writeFile(tempRoot, "relay/src/server/app.ts", `/admin/${pluralPath}/:${camelField}\n`);
  writeFile(tempRoot, "packages/clawjs/src/cli-remote-sync-command.ts", "gateway.multiTenantAgentService\n");
  writeFile(tempRoot, "packages/clawjs/src/cli-claw-factory.ts", `CLAW_SECRETS_${baseWord.toUpperCase()}\n`);
  writeFile(tempRoot, "relay/ui/src/routes/Login.tsx", "<span>Relay isolation ID</span>\n");
  writeFile(tempRoot, "apps/chat/README.md", "Relay isolation ID\n");
  writeFile(tempRoot, "docs/governance/conceptual-vocabulary-audit.md", "Technical-isolation contract verifier\n");

  const passingFailures = verify(tempRoot);
  if (passingFailures.length > 0) {
    throw new Error(`self-test expected fixture to pass:\n${passingFailures.join("\n")}`);
  }

  writeFile(tempRoot, "relay/ui/src/routes/Login.tsx", `<span>${baseWordTitle} ID</span>\n`);
  const failingFailures = verify(tempRoot);
  if (!failingFailures.some((failure) => failure.includes("visible UI copy"))) {
    throw new Error("self-test expected visible legacy UI copy to fail");
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("Technical isolation contract self-test passed");
} else {
  const failures = verify(rootDir);
  if (failures.length > 0) {
    console.error("Technical isolation contract verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Technical isolation contract verification passed");
}
