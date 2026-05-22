import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import { openDomainsDisabledHostsFile, openDomainsHostsFile } from "./cli-legacy-open.ts";

test("open domain helpers resolve host paths through Mac Care route defaults", () => {
  assert.equal(openDomainsHostsFile({}), "/etc/hosts");
  assert.equal(openDomainsDisabledHostsFile(), "/tmp/claw-domains-disabled-hosts");
});

test("open domain helpers preserve explicit host file overrides", () => {
  assert.equal(openDomainsHostsFile({ "hosts-file": "/tmp/hosts" }), "/tmp/hosts");
  assert.equal(openDomainsHostsFile({ "domains-hosts-file": "/tmp/domains-hosts" }), "/tmp/domains-hosts");
  assert.equal(
    openDomainsHostsFile({ "domains-hosts-file": "/tmp/domains-hosts", "hosts-file": "/tmp/hosts" }),
    "/tmp/domains-hosts",
  );
});

test("open domain helpers require Mac Care route atlas entries", () => {
  const source = fs.readFileSync(new URL("./cli-legacy-open.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\(routeId\)/);
  assert.equal(source.includes("resolveMacCareRoutePathPattern(routeId) ?? fallback"), false);
  assert.equal(source.includes('macCareSystemRoutePath("mac_care.route.system_hosts_file", "/etc/hosts")'), false);
  assert.equal(source.includes('macCareSystemRoutePath("mac_care.route.system_temp", os.tmpdir())'), false);
});
