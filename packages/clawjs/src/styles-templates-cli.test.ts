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
