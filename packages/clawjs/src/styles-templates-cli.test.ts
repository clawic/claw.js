import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

function writeFile(root: string, relativePath: string, content: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("style returns JSON usage errors for unknown subcommands", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-style-unknown-subcommand-"));
  const workspaceRoot = path.join(root, "workspace");

  const result = await runCliCapture(["style", "definitely_missing", "--workspace", workspaceRoot, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: { received?: string | null; validSubcommands?: string[] };
    };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string | null };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_style_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.styles.subcommand");
  assert.match(payload.error.safeNextStep, /style list --json/);
  assert.equal(payload.error.details?.received, "definitely_missing");
  assert.deepEqual(payload.error.details?.validSubcommands, ["list", "get", "create", "delete", "export", "import", "install-builtins", "builtins"]);
  assert.equal(payload.meta.canonicalCommand, "styles");
  assert.equal(payload.meta.invokedCommand, "style");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "styles")), false);
});

test("styles returns JSON usage errors for invalid usage without writing workspace state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-styles-invalid-usage-"));
  const workspaceRoot = path.join(root, "workspace");

  const result = await runCliCapture(["styles", "export", "claw", "--workspace", workspaceRoot, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: { received?: string | null; validSubcommands?: string[] };
    };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string | null; operation?: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_style_export_usage");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.styles.subcommand");
  assert.match(payload.error.safeNextStep, /style export <id> --out <dir> --json/);
  assert.equal(payload.error.details?.received, "export");
  assert.ok(payload.error.details?.validSubcommands?.includes("export"));
  assert.equal(payload.meta.canonicalCommand, "styles");
  assert.equal(payload.meta.invokedCommand, "style");
  assert.equal(payload.meta.subcommand, "export");
  assert.equal(payload.meta.operation, "claw");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "styles")), false);
});

test("style import reports malformed STYLE.md frontmatter as a json usage error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-style-frontmatter-"));
  const sourceDir = path.join(root, "bad-style");
  writeFile(sourceDir, "STYLE.md", "---json\n{bad\n---\n# Bad style\n");

  const result = await runCliCapture(["style", "import", sourceDir, "--workspace", path.join(root, "workspace"), "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_style_frontmatter_json");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "style.frontmatter");
  assert.equal(payload.meta.canonicalCommand, "styles");
  assert.equal(payload.meta.subcommand, "import");
});

test("style create reports invalid --id as a json usage error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-style-invalid-cli-id-"));
  const workspaceRoot = path.join(root, "workspace");

  const result = await runCliCapture(["style", "create", "Bad", "--id", "../bad", "--workspace", workspaceRoot, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      details?: { received?: string; validPattern?: string; disallowedValues?: string[] };
    };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_style_id");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "style.id");
  assert.equal(payload.error.details?.received, "../bad");
  assert.equal(payload.error.details?.validPattern, "^[A-Za-z0-9][A-Za-z0-9._-]*$");
  assert.deepEqual(payload.error.details?.disallowedValues, [".", ".."]);
  assert.equal(payload.meta.canonicalCommand, "styles");
  assert.equal(payload.meta.subcommand, "create");
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "styles")), false);
});

test("template get reports malformed TEMPLATE.md frontmatter as a json usage error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-frontmatter-"));
  writeFile(root, ".claw/templates/bad-template/TEMPLATE.md", "---json\n{bad\n---\n# Bad template\n");

  const result = await runCliCapture(["template", "get", "bad-template", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_template_frontmatter_json");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "template.frontmatter");
  assert.equal(payload.meta.canonicalCommand, "templates");
  assert.equal(payload.meta.subcommand, "get");
});

test("template get reports invalid TEMPLATE.md manifests as usage errors", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-manifest-"));
  writeFile(root, ".claw/templates/bad-template/TEMPLATE.md", "---json\n{\"id\":\"bad-template\",\"name\":\"Bad template\",\"category\":\"report\"}\n---\n# Bad template\n");

  const result = await runCliCapture(["template", "get", "bad-template", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string; message: string };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_template_manifest");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "template.manifest");
  assert.match(payload.error.message, /aspect/);
  assert.equal(payload.meta.canonicalCommand, "templates");
  assert.equal(payload.meta.subcommand, "get");
});

test("reference get reports malformed REFERENCE.md frontmatter as a json usage error", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-reference-frontmatter-"));
  writeFile(root, ".claw/references/bad-reference/REFERENCE.md", "---json\n{bad\n---\n# Bad reference\n");

  const result = await runCliCapture(["ref", "get", "bad-reference", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_reference_frontmatter_json");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "reference.frontmatter");
  assert.equal(payload.meta.canonicalCommand, "references");
  assert.equal(payload.meta.subcommand, "get");
});

test("reference get reports invalid REFERENCE.md manifests as usage errors", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-reference-manifest-"));
  writeFile(root, ".claw/references/bad-reference/REFERENCE.md", "---json\n{\"id\":\"bad-reference\",\"type\":\"unknown\",\"name\":\"Bad reference\"}\n---\n# Bad reference\n");

  const result = await runCliCapture(["ref", "get", "bad-reference", "--workspace", root, "--json"], root);

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string; message: string };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_reference_manifest");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "reference.manifest");
  assert.match(payload.error.message, /type/);
  assert.equal(payload.meta.canonicalCommand, "references");
  assert.equal(payload.meta.subcommand, "get");
});
