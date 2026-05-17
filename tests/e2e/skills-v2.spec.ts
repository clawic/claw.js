import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { expect, test } from "./fixtures";

const execFileAsync = promisify(execFile);

const BIN = path.join(process.cwd(), "packages", "clawjs", "bin", "claw.mjs");

interface RunOptions {
  home: string;
  workspace: string;
}

async function run(options: RunOptions, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const env = {
    ...process.env,
    CLAW_HOME: options.home,
    CLAW_SKILLS_AUTO_IMPORT: "0",
    HOME: options.home,
  };
  return await execFileAsync(process.execPath, [BIN, "--workspace", options.workspace, ...args], { env, cwd: process.cwd() });
}

function freshEnv(prefix: string): RunOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  return { home, workspace };
}

function parseCliData<T>(stdout: string): T {
  const envelope = JSON.parse(stdout) as { ok: boolean; data: T };
  expect(envelope.ok).toBe(true);
  return envelope.data;
}

test("skills-v2 CLI: create, list, view, activate, compile, sync to mock target, edit, follow symlink", async () => {
  const env = freshEnv("clawjs-skills-v2-");
  const externalTarget = path.join(env.home, "external-codex");
  fs.mkdirSync(externalTarget, { recursive: true });

  // Register a mock sync target
  await run(env, [
    "skills", "create", "cold-email",
    "--kind", "procedure",
    "--description", "Write a formal cold sales email.",
    "--body", "Be concise. Single CTA. No fluff.",
    "--tags", "email,sales",
    "--sync-to", "test-target",
  ]);

  const list = await run(env, ["skills", "list", "--json"]);
  const parsed = parseCliData<Array<{ slug: string; kind: string }>>(list.stdout);
  expect(parsed.find((s) => s.slug === "cold-email")?.kind).toBe("procedure");

  const view = await run(env, ["skills", "view", "cold-email", "--json"]);
  const spec = parseCliData<{ body: string; description: string }>(view.stdout);
  expect(spec.description).toContain("cold sales email");
  expect(spec.body).toContain("Single CTA");

  await run(env, ["skills", "activate", "cold-email", "--scope", "global"]);
  const compiled = await run(env, ["skills", "compile", "cold-email"]);
  expect(compiled.stdout).toContain("# cold-email");
  expect(compiled.stdout).toContain("Single CTA");

  // Register the test sync target
  // NOTE: there's no "register-sync-target" CLI command yet — write config directly.
  const configPath = path.join(env.home, "config.yaml");
  fs.writeFileSync(configPath, `skills:\n  sync_targets:\n    - id: test-target\n      home: ${externalTarget}\n      mode: symlink\n`);

  const syncResult = await run(env, ["skills", "sync", "--target", "test-target", "--json"]);
  const report = parseCliData<{ synced: Array<{ slug: string }>; warnings: string[] }>(syncResult.stdout);
  expect(report.synced.find((s) => s.slug === "cold-email")).toBeDefined();

  const linkPath = path.join(externalTarget, "cold-email");
  const linkContents = fs.readFileSync(path.join(linkPath, "SKILL.md"), "utf8");
  expect(linkContents).toContain("Single CTA");

  // Edit the central skill — symlinked file reflects update.
  const centralPath = path.join(env.home, "skills", "procedure", "cold-email", "SKILL.md");
  const original = fs.readFileSync(centralPath, "utf8");
  fs.writeFileSync(centralPath, original.replace("Single CTA", "Single CTA. Time-boxed."));
  const updatedSymlinked = fs.readFileSync(path.join(linkPath, "SKILL.md"), "utf8");
  expect(updatedSymlinked).toContain("Time-boxed.");
});

test("skills-v2 CLI: instantiate template, freeze instance produces inline body", async () => {
  const env = freshEnv("clawjs-skills-v2-instance-");

  await run(env, [
    "skills", "create", "email-writing",
    "--kind", "procedure",
    "--description", "Email writing template.",
    "--body", "Write {{tone}} email of length {{length}} for {{industry}}.",
  ]);

  const inst = await run(env, [
    "skills", "instantiate", "email-writing",
    "--params", "tone=formal,length=short,industry=SaaS",
    "--save-as", "my-cold-email",
    "--json",
  ]);
  const instance = parseCliData<{ slug: string; body: string }>(inst.stdout);
  expect(instance.slug).toBe("my-cold-email");

  const compileBefore = await run(env, ["skills", "compile", "my-cold-email"]);
  expect(compileBefore.stdout).toContain("Write formal email of length short for SaaS.");

  // Freeze and verify body is inline.
  await run(env, ["skills", "freeze", "my-cold-email"]);
  const viewFrozen = await run(env, ["skills", "view", "my-cold-email", "--json"]);
  const frozen = parseCliData<{ body: string; frontmatter: { metadata: { clawjs: { instance: { frozen: boolean } } } } }>(viewFrozen.stdout);
  expect(frozen.body).toContain("Write formal email of length short for SaaS.");
  expect(frozen.frontmatter.metadata.clawjs.instance.frozen).toBe(true);
});

test("skills-v2 CLI: importer copies external skills into central and replaces with symlink", async () => {
  const env = freshEnv("clawjs-skills-v2-import-");

  // Lay down a fake external SKILL.md
  const externalDir = path.join(env.home, "fake-codex", "skills", "foo-skill");
  fs.mkdirSync(externalDir, { recursive: true });
  fs.writeFileSync(path.join(externalDir, "SKILL.md"), [
    "---",
    "name: foo-skill",
    "description: Test imported skill from a fake external dir.",
    "version: 0.1.0",
    "metadata:",
    "  clawjs:",
    "    schemaVersion: 1",
    "    kind: procedure",
    "---",
    "# Foo Skill",
    "",
    "Hello world.",
    "",
  ].join("\n"));

  await run(env, ["skills", "import", "--from", path.dirname(externalDir), "--json"]);

  // Central copy exists.
  const central = path.join(env.home, "skills", "procedure", "foo-skill", "SKILL.md");
  expect(fs.existsSync(central)).toBeTruthy();
  expect(fs.readFileSync(central, "utf8")).toContain("Hello world.");

  // Original is now a symlink back to central.
  const origStat = fs.lstatSync(externalDir);
  expect(origStat.isSymbolicLink()).toBeTruthy();
  const linkTarget = fs.readlinkSync(externalDir);
  const resolvedTarget = path.isAbsolute(linkTarget) ? linkTarget : path.resolve(path.dirname(externalDir), linkTarget);
  expect(resolvedTarget).toBe(path.dirname(central));
});
