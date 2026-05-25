import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildDomainsPlist,
  buildDomainsProxyScript,
  buildDomainsServiceConfig,
  domainsInstallPlan,
  domainsServiceDir,
  domainsTempPath,
} from "./cli-domains-config.ts";

test("domains config defaults resolve system paths through the Mac Care route atlas", () => {
  assert.equal(domainsServiceDir({}), "/Library/Application Support/Claw/domains");

  const plan = domainsInstallPlan({});
  assert.equal(plan.plistFile, "/Library/LaunchDaemons/com.claw.domains.plist");
  assert.equal(plan.hostsFile, "/etc/hosts");

  const plist = buildDomainsPlist({});
  assert.match(plist, /<string>\/Library\/Application Support\/Claw\/domains<\/string>/);
  assert.match(plist, /<string>\/tmp\/claw-domains\.out\.log<\/string>/);
  assert.match(plist, /<string>\/tmp\/claw-domains\.err\.log<\/string>/);
  assert.equal(domainsTempPath("claw-domains-hosts-123"), "/tmp/claw-domains-hosts-123");

  const proxyScript = buildDomainsProxyScript();
  assert.match(proxyScript, /"\/tmp\/claw-domains-disabled-hosts"/);
  assert.match(proxyScript, /"\/bin\/launchctl"/);
  assert.match(proxyScript, /"\/usr\/bin\/sudo"/);
  assert.match(proxyScript, /"\/usr\/bin\/env"/);
});

test("domains config explicit path flags still override Mac Care route defaults", () => {
  const flags = {
    "service-dir": "/tmp/claw-domains-service",
    "plist-file": "/tmp/com.claw.domains.plist",
  };

  assert.equal(domainsServiceDir(flags), "/tmp/claw-domains-service");
  assert.equal(domainsInstallPlan(flags).plistFile, "/tmp/com.claw.domains.plist");
  assert.equal(domainsInstallPlan({ ...flags, "hosts-file": "/tmp/hosts" }).hostsFile, "/tmp/hosts");
  assert.match(buildDomainsPlist(flags), /<string>\/tmp\/claw-domains-service<\/string>/);
});

test("domains config rejects invalid proxy ports before generating service config", () => {
  assert.throws(
    () => domainsInstallPlan({ port: "nope" }),
    /Invalid port: nope/,
  );
  assert.throws(
    () => domainsInstallPlan({ port: "0x50" }),
    /Invalid port: 0x50/,
  );
  assert.throws(
    () => domainsInstallPlan({ port: "1e3" }),
    /Invalid port: 1e3/,
  );
  assert.throws(
    () => domainsInstallPlan({ port: "0" }),
    /Invalid port: 0/,
  );
  assert.throws(
    () => buildDomainsServiceConfig({ port: "65536" }, "/tmp/workspace", {
      repoRoot: "/tmp/repo",
      cliEntryPath: "/tmp/repo/packages/clawjs/bin/claw.mjs",
      nodePath: "/usr/bin/node",
    }),
    /Invalid port: 65536/,
  );
});

test("domains config rejects malformed surface port overrides", () => {
  assert.throws(
    () => buildDomainsServiceConfig({ "surface-port": "memory=0x1234" }, "/tmp/workspace", {
      repoRoot: "/tmp/repo",
      cliEntryPath: "/tmp/repo/packages/clawjs/bin/claw.mjs",
      nodePath: "/usr/bin/node",
    }),
    /Invalid --surface-port entry "memory=0x1234"/,
  );
  assert.throws(
    () => buildDomainsServiceConfig({ "surface-port": "memory=123=456" }, "/tmp/workspace", {
      repoRoot: "/tmp/repo",
      cliEntryPath: "/tmp/repo/packages/clawjs/bin/claw.mjs",
      nodePath: "/usr/bin/node",
    }),
    /Invalid --surface-port entry "memory=123=456"/,
  );
});

test("domains config defaults require Mac Care route atlas entries", () => {
  const source = fs.readFileSync(new URL("./cli-domains-config.ts", import.meta.url), "utf8");
  const commandSource = fs.readFileSync(new URL("./cli-domains-command.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\(routeId\)/);
  assert.match(commandSource, /domainsTempPath\(`claw-domains-hosts-\$\{process\.pid\}`\)/);
  assert.equal(source.includes("resolveMacCareRoutePathPattern(routeId) ?? fallback"), false);
  assert.equal(commandSource.includes("os.tmpdir()"), false);
  assert.equal(source.includes('macCareSystemRoutePath("mac_care.route.system_temp", "/tmp")'), false);
  assert.equal(source.includes('macCareSystemRoutePath("mac_care.route.system_hosts_file", "/etc/hosts")'), false);
  assert.equal(source.includes('domainsSystemToolPath("mac_care.route.system_launchctl_cli", "/bin/launchctl")'), false);
});
