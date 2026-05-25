import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { scaffoldProject } from "./scaffold.ts";

function captureStream() {
  return {
    write() {
      return true;
    },
  } as unknown as NodeJS.WritableStream;
}

test("scaffoldProject removes temporary files when template copy fails", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-scaffold-atomic-"));
  const templateDir = path.join(root, "template");
  const targetPath = path.join(root, "generated-app");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "a-good.txt"), "hello __APP_NAME__", "utf8");

  try {
    fs.symlinkSync(path.join(root, "missing-template-file.txt"), path.join(templateDir, "z-broken.txt"));
  } catch {
    return;
  }

  await assert.rejects(
    scaffoldProject({
      context: {
        stdout: captureStream(),
        stderr: captureStream(),
        cwd: root,
      },
      targetPath,
      templateDir,
      replacements: { "__APP_NAME__": "demo" },
      packageManager: "npm",
      install: false,
      successLabel: "demo",
      nextSteps: [],
    }),
  );

  assert.equal(fs.existsSync(targetPath), false);
  assert.deepEqual(
    fs.readdirSync(root).filter((entry) => entry.includes("generated-app")),
    [],
  );
});
