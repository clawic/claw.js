// Dev-null adapter for testing. Publishes to nowhere; returns a synthetic
// provider_post_id so the pipeline can end-to-end without a network call.
// Supports a "mode" knob in options to force success/failure/rate-limit.

import { prefixedId } from "../../shared/ids.ts";
import type { AdapterModule, AdapterContext, AdapterVariant, ChannelAccountState } from "./contract.ts";
import { FAMILIES } from "./families.ts";

const family = FAMILIES.find((f) => f.id === "devnull")!;

export const devnullModule: AdapterModule = {
  family,
  adapter: {
    async connectStatic(_ctx, params) {
      return {
        providerAccountId: String(params.provider_account_id ?? `dev_${Date.now()}`),
        displayName: String(params.display_name ?? "Dev Null"),
        handle: (params.handle as string) ?? null,
        credentialsVaultRef: "vault_devnull",
        scopes: [],
      };
    },
    async probeHealth() {
      return { status: "ok", details: { devnull: true } };
    },
    async inspectCapabilities() {
      return family.capabilities;
    },
    async validate(_ctx: AdapterContext, _account: ChannelAccountState, variant: AdapterVariant) {
      const mode = (variant.options.devnull_mode as string | undefined) ?? "ok";
      const issues: Array<{ code: string; message: string; blocking: boolean }> = [];
      if (mode === "invalid") {
        issues.push({ code: "forced_invalid", message: "devnull_mode=invalid forced this failure", blocking: true });
      }
      return { ok: issues.every((i) => !i.blocking), issues };
    },
    async requiredConversions() {
      return [];
    },
    async publish(_ctx: AdapterContext, account: ChannelAccountState, variant: AdapterVariant) {
      const mode = (variant.options.devnull_mode as string | undefined) ?? "ok";
      if (mode === "rate_limited") {
        return { ok: false, errorCode: "rate_limited", errorMessage: "forced rate-limit", retryAfterSeconds: 5 };
      }
      if (mode === "unauthorized") {
        return { ok: false, errorCode: "unauthorized", errorMessage: "forced unauthorized", unauthorized: true };
      }
      if (mode === "fail") {
        return { ok: false, errorCode: "transient", errorMessage: "forced failure" };
      }
      const providerPostId = prefixedId("devnull_post");
      return {
        ok: true,
        providerPostId,
        providerData: {
          permalink: `devnull://${account.providerAccountId}/${providerPostId}`,
          posted_at: new Date().toISOString(),
          body_preview: variant.blocks[0]?.body?.slice(0, 80) ?? "",
        },
      };
    },
    async delete() {
      return;
    },
    async fetchInsightsDaily(_ctx, _account, date) {
      return {
        metrics: {
          impressions: 42,
          engagements: 7,
          clicks: 1,
        },
        // date is echoed by the framework
      };
    },
    async fetchAudienceDaily() {
      return { total: 100 };
    },
  },
};
