import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildPrivilegedAppleScriptCommand,
  buildPrivilegedHelperScript,
  domainsPrivilegeHelperPath,
  domainsPrivilegeOsascriptPath,
  domainsPrivilegeShellPath,
} from "./cli-domains-privileges.ts";

test("domains privileged helper shell resolves through the Mac Care route atlas", () => {
  assert.equal(domainsPrivilegeShellPath(), "/bin/sh");
  assert.equal(domainsPrivilegeOsascriptPath(), "/usr/bin/osascript");
  assert.equal(domainsPrivilegeHelperPath(12345), "/tmp/claw-domains-privileged-12345.sh");
  assert.equal(buildPrivilegedHelperScript("echo ready"), "#!/bin/sh\nset -eu\necho ready\n");
});

test("domains privileged AppleScript command uses the atlas-backed shell path", () => {
  assert.equal(
    buildPrivilegedAppleScriptCommand("/tmp/claw domains helper.sh"),
    `do shell script "/bin/sh '/tmp/claw domains helper.sh'" with administrator privileges`,
  );
});

test("domains privileged helpers require Mac Care route atlas entries", () => {
  const source = fs.readFileSync(new URL("./cli-domains-privileges.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\(routeId\)/);
  assert.equal(source.includes("resolveMacCareRoutePathPattern(routeId) ?? fallback"), false);
  assert.equal(source.includes("os.tmpdir()"), false);
  assert.match(source, /domainsPrivilegeSystemToolPath\("mac_care\.route\.system_temp"\)/);
  assert.match(source, /domainsPrivilegeSystemToolPath\("mac_care\.route\.system_osascript_cli"\)/);
  assert.equal(source.includes('spawnSync("osascript"'), false);
  assert.equal(source.includes('domainsPrivilegeSystemToolPath("mac_care.route.system_sh_cli", "/bin/sh")'), false);
  assert.equal(source.includes('domainsPrivilegeSystemToolPath("mac_care.route.system_sudo_cli", "/usr/bin/sudo")'), false);
});
