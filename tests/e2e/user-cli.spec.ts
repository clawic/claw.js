import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function clawBin(rootDir: string): string {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

test("UserSpec CLI stores verified human facts and omits pending proposals", async ({ page }) => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "USER.md"), "Manual user note.\n");

  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "init", "--name", "Test User", ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "identity.displayName", "Test User", ...baseArgs,
  ], { cwd: rootDir });
  const pending = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "propose", "residence.city", "Pending City", "--source", "conversation", ...baseArgs,
  ], { cwd: rootDir });
  const pendingPayload = JSON.parse(pending.stdout) as { id: string };

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const firstCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(firstCompiled).toContain("Manual user note.");
  expect(firstCompiled).toContain("CLAWJS:user-spec:START");
  expect(firstCompiled).toContain("Display Name: Test User");
  expect(firstCompiled).not.toContain("Pending City");

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "verify", pendingPayload.id, ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const verifiedCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(verifiedCompiled).toContain("City: Pending City");

  await page.setContent(`<main><h1>UserSpec CLI</h1><pre>${verifiedCompiled.replace(/[<>&]/g, "")}</pre></main>`);
  await saveArtifactScreenshot(page, "user-cli-compiled.png");
});

test("UserSpec CLI resolves default users, multi-user profiles, and agent assignments", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-multi-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "init", "--name", "Default Human", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "init", "parent", "--name", "Parent Human", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "set", "identity.role", "default operator", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "set", "identity.role", "family admin", "--user", "parent", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "assign", "parent", "--agent", "family-agent", ...baseArgs], { cwd: rootDir });

  const fallback = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "preview", ...baseArgs], { cwd: rootDir });
  expect(fallback.stdout).toContain("Default Human");
  expect(fallback.stdout).toContain("default operator");

  const assigned = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "preview", "--agent", "family-agent", ...baseArgs], { cwd: rootDir });
  expect(assigned.stdout).toContain("Parent Human");
  expect(assigned.stdout).toContain("family admin");
});

test("UserSpec CLI rejects behavior preferences that belong in rules", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-boundaries-"));
  const workspaceDir = path.join(tempRoot, "workspace");

  await expect(execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "communication.verbosity", "concise", "--workspace", workspaceDir, "--json",
  ], { cwd: rootDir }))
    .rejects
    .toMatchObject({
      stdout: expect.stringContaining("Behavior preferences belong in rules"),
    });
});

test("UserSpec CLI expands humans with packs, guided proposals, entities, links, query, and delete", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-expanded-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "init", "--name", "Expanded User", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "pack", "enable", "professional", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "pack", "enable", "practical", ...baseArgs], { cwd: rootDir });

  const wizard = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "wizard", "professional", "--title", "Example Launch", "--set", "role=lead", ...baseArgs,
  ], { cwd: rootDir });
  const wizardPayload = JSON.parse(wizard.stdout) as { id: string; status: string; source: string };
  expect(wizardPayload.status).toBe("pending");
  expect(wizardPayload.source).toBe("wizard:professional");

  const organization = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "entity", "add", "organization", "--title", "Example Org", "--set", "url=example.local", ...baseArgs,
  ], { cwd: rootDir });
  const person = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "entity", "add", "person", "--title", "Example Collaborator", ...baseArgs,
  ], { cwd: rootDir });
  const organizationPayload = JSON.parse(organization.stdout) as { id: string };
  const personPayload = JSON.parse(person.stdout) as { id: string };

  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "link", personPayload.id, "works_with", organizationPayload.id, ...baseArgs,
  ], { cwd: rootDir });

  const queryBeforeVerify = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "query", "--domain", "professional", "--status", "pending", ...baseArgs,
  ], { cwd: rootDir });
  const queryBeforeVerifyPayload = JSON.parse(queryBeforeVerify.stdout) as { proposals: Array<{ id: string }> };
  expect(queryBeforeVerifyPayload.proposals.map((entry) => entry.id)).toContain(wizardPayload.id);

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "verify", wizardPayload.id, ...baseArgs], { cwd: rootDir });
  const queryAfterVerify = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "query", "--domain", "professional", "--text", "Example Launch", ...baseArgs,
  ], { cwd: rootDir });
  const queryAfterVerifyPayload = JSON.parse(queryAfterVerify.stdout) as { records: Array<{ title: string }> };
  expect(queryAfterVerifyPayload.records.map((entry) => entry.title)).toContain("Example Launch");

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const compiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(compiled).toContain("Enabled User Packs");
  expect(compiled).toContain("Example Launch");
  expect(compiled).toContain("Linked Entities");

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "delete", organizationPayload.id, ...baseArgs], { cwd: rootDir });
  const entityList = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "entity", "list", ...baseArgs], { cwd: rootDir });
  expect(entityList.stdout).not.toContain(organizationPayload.id);
  const linkList = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "query", "--type", "works_with", ...baseArgs], { cwd: rootDir });
  const linkListPayload = JSON.parse(linkList.stdout) as { links: unknown[] };
  expect(linkListPayload.links).toHaveLength(0);
});

test("UserSpec CLI keeps sensitive wellbeing data opt-in and out of compile unless explicitly public", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-user-sensitive-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const baseArgs = ["--workspace", workspaceDir, "--json"];

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "init", "--name", "Private User", ...baseArgs], { cwd: rootDir });
  await expect(execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "health.sleep", "light", ...baseArgs,
  ], { cwd: rootDir })).rejects.toMatchObject({
    stdout: expect.stringContaining("requires enabled user pack"),
  });

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "pack", "enable", "wellbeing", ...baseArgs], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "health.sleep", "light", "--source", "manual", ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const privateCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(privateCompiled).not.toContain("Sleep: light");

  await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "set", "health.sleep", "light", "--source", "manual", "--visibility", "public", ...baseArgs,
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const publicCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(publicCompiled).toContain("Sleep: light");

  const memoryProposal = await execFileAsync(process.execPath, [
    clawBin(rootDir), "user", "propose", "health.energy", "low", "--source", "memory", "--visibility", "public", ...baseArgs,
  ], { cwd: rootDir });
  const memoryProposalPayload = JSON.parse(memoryProposal.stdout) as { id: string };
  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "compile", ...baseArgs], { cwd: rootDir });
  const proposedCompiled = fs.readFileSync(path.join(workspaceDir, "USER.md"), "utf8");
  expect(proposedCompiled).not.toContain("Energy: low");
  expect(proposedCompiled).toContain("Pending proposed facts are intentionally omitted");

  await execFileAsync(process.execPath, [clawBin(rootDir), "user", "delete", memoryProposalPayload.id, ...baseArgs], { cwd: rootDir });
  const pending = await execFileAsync(process.execPath, [clawBin(rootDir), "user", "query", "--status", "pending", ...baseArgs], { cwd: rootDir });
  const pendingPayload = JSON.parse(pending.stdout) as { proposals: unknown[] };
  expect(pendingPayload.proposals).toHaveLength(0);
});
