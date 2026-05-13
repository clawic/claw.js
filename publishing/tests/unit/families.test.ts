import { test } from "node:test";
import assert from "node:assert/strict";

import { FAMILIES, familyMap } from "../../src/server/channels/families.ts";
import { ChannelRegistry } from "../../src/server/channels/index.ts";

test("every family has a capability descriptor", () => {
  for (const family of FAMILIES) {
    assert.ok(family.capabilities.text.maxChars > 0, `family ${family.id} missing text.maxChars`);
    assert.ok(Array.isArray(family.capabilities.contentKinds), `family ${family.id} missing contentKinds`);
  }
});

test("family map is unique per id", () => {
  const map = familyMap();
  assert.equal(map.size, FAMILIES.length);
});

test("registry exposes an adapter for every family", () => {
  const reg = new ChannelRegistry();
  for (const family of reg.list()) {
    const adapter = reg.adapter(family.id);
    assert.ok(adapter, `no adapter for ${family.id}`);
    assert.equal(typeof adapter!.publish, "function");
    assert.equal(typeof adapter!.validate, "function");
    assert.equal(typeof adapter!.probeHealth, "function");
    assert.equal(typeof adapter!.inspectCapabilities, "function");
  }
});

test("registry includes the standard set of social/non-social families", () => {
  const reg = new ChannelRegistry();
  const ids = new Set(reg.list().map((f) => f.id));
  for (const expected of [
    "x", "mastodon", "bluesky", "facebook_page", "facebook_group", "instagram", "threads",
    "linkedin_profile", "linkedin_org", "tiktok", "youtube", "youtube_short", "pinterest", "gbp",
    "rss_feed", "discord", "telegram", "slack", "whatsapp_business",
    "reddit", "hackernews", "wordpress", "ghost", "substack", "medium", "devto", "hashnode",
    "smtp", "convertkit", "mailchimp", "klaviyo", "buttondown", "beehiiv",
    "lu_ma", "eventbrite", "meetup", "github_release", "github_discussion",
    "notion_page", "confluence_page", "webhook_outbound", "push_notification",
  ]) {
    assert.ok(ids.has(expected), `missing family: ${expected}`);
  }
});
