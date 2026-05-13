import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = dirname(here);
const installScript = join(bridgeRoot, "scripts/install.sh");

async function makeFakeTarball(version: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "clawjs-fake-pkg-"));
  const entryDir = join(dir, `claw-remote-${version}`);
  await mkdir(join(entryDir, "bin"), { recursive: true });
  await mkdir(join(entryDir, "lib"), { recursive: true });
  await writeFile(
    join(entryDir, "lib/start.cjs"),
    'console.log("fake claw-remote");\n',
    "utf8",
  );
  await writeFile(
    join(entryDir, "bin/claw-remote"),
    [
      "#!/bin/sh",
      'HERE="$(cd "$(dirname "$0")/.." && pwd)"',
      'exec node "$HERE/lib/start.cjs" "$@"',
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(join(entryDir, "bin/claw-remote"), 0o755);
  await writeFile(
    join(entryDir, "package.json"),
    JSON.stringify({ name: "claw-remote-runtime", version, private: true }),
    "utf8",
  );
  await writeFile(join(entryDir, "INSTALL.txt"), "fake install instructions\n", "utf8");
  const tarball = join(dir, `claw-remote-fake-${version}.tar.gz`);
  await execFileAsync("tar", ["-czf", tarball, "-C", dir, `claw-remote-${version}`]);
  return tarball;
}

async function makeIsolatedHome(): Promise<{
  home: string;
  prefix: string;
  binDir: string;
  cleanup: () => Promise<void>;
}> {
  const home = await mkdtemp(join(tmpdir(), "clawjs-install-home-"));
  const prefix = join(home, "claw-remote");
  const binDir = join(home, "bin");
  return {
    home,
    prefix,
    binDir,
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}

async function runInstall(args: string[], home: string): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(installScript, args, {
      env: { ...process.env, HOME: home, PATH: process.env.PATH ?? "/usr/bin" },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("close", (code) =>
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
  });
}

test("install.sh --help prints usage", async () => {
  const { code, stdout } = await runInstall(["--help"], "/tmp");
  assert.equal(code, 0);
  assert.match(stdout, /Install claw-remote/);
  assert.match(stdout, /--tarball/);
  assert.match(stdout, /--systemd/);
  assert.match(stdout, /--launchd/);
});

test("install.sh extracts a tarball and creates a working symlink", async () => {
  const h = await makeIsolatedHome();
  try {
    const tarball = await makeFakeTarball("0.0.1-fake");
    const result = await runInstall(
      [
        "--tarball",
        tarball,
        "--prefix",
        h.prefix,
        "--bin",
        h.binDir,
        "--no-start",
      ],
      h.home,
    );
    assert.equal(result.code, 0, `install failed: ${result.stderr}`);

    const start = await stat(join(h.prefix, "lib/start.cjs"));
    assert.ok(start.isFile());
    const wrapper = await stat(join(h.prefix, "bin/claw-remote"));
    assert.ok(wrapper.isFile());
    const link = await stat(join(h.binDir, "claw-remote"));
    assert.ok(link.isFile());
    const pkg = JSON.parse(
      await readFile(join(h.prefix, "package.json"), "utf8"),
    );
    assert.equal(pkg.version, "0.0.1-fake");
  } finally {
    await h.cleanup();
  }
});

test("install.sh --launchd writes a plist on macOS", async () => {
  if (process.platform !== "darwin") return; // skip on non-mac
  const h = await makeIsolatedHome();
  try {
    const tarball = await makeFakeTarball("0.0.1-fake");
    const result = await runInstall(
      [
        "--tarball",
        tarball,
        "--prefix",
        h.prefix,
        "--bin",
        h.binDir,
        "--launchd",
        "--bridge-port",
        "7778",
        "--http-port",
        "7779",
        "--no-start",
      ],
      h.home,
    );
    assert.equal(result.code, 0, `install failed: ${result.stderr}`);
    const plistPath = join(
      h.home,
      "Library/LaunchAgents/com.claw.remote.plist",
    );
    const plist = await readFile(plistPath, "utf8");
    assert.match(plist, /com\.clawjs\.bridged/);
    assert.match(plist, /CLAW_REMOTE_PORT/);
    assert.match(plist, /7779/);
  } finally {
    await h.cleanup();
  }
});

test("install.sh --uninstall removes prefix + symlink + launchd plist", async () => {
  if (process.platform !== "darwin") return;
  const h = await makeIsolatedHome();
  try {
    const tarball = await makeFakeTarball("0.0.1-fake");
    await runInstall(
      [
        "--tarball",
        tarball,
        "--prefix",
        h.prefix,
        "--bin",
        h.binDir,
        "--launchd",
        "--no-start",
      ],
      h.home,
    );
    const before = await stat(h.prefix);
    assert.ok(before.isDirectory());
    const un = await runInstall(
      ["--uninstall", "--prefix", h.prefix, "--bin", h.binDir],
      h.home,
    );
    assert.equal(un.code, 0, `uninstall failed: ${un.stderr}`);
    await assert.rejects(stat(h.prefix));
    await assert.rejects(stat(join(h.binDir, "claw-remote")));
    await assert.rejects(
      stat(join(h.home, "Library/LaunchAgents/com.claw.remote.plist")),
    );
  } finally {
    await h.cleanup();
  }
});

test("install.sh errors when tarball is missing", async () => {
  const h = await makeIsolatedHome();
  try {
    const r = await runInstall(["--tarball", "/tmp/does-not-exist.tgz"], h.home);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /not found/);
  } finally {
    await h.cleanup();
  }
});

test("install.sh refuses --systemd on a non-Linux host", async () => {
  if (process.platform === "linux") return;
  const h = await makeIsolatedHome();
  try {
    const tarball = await makeFakeTarball("0.0.1-fake");
    const r = await runInstall(
      [
        "--tarball",
        tarball,
        "--prefix",
        h.prefix,
        "--bin",
        h.binDir,
        "--systemd",
        "--no-start",
      ],
      h.home,
    );
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /Linux-only/);
  } finally {
    await h.cleanup();
  }
});
