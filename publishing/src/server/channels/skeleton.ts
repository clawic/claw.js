// Generic skeleton adapter: every family in the registry ships with an
// instance of this if no concrete adapter is provided. publish() returns
// not_implemented; everything else is a sane no-op so the framework can
// connect, validate, and probe even before the network is wired.

import type {
  CapabilityDescriptor,
  ChannelFamilyDescriptor,
} from "../../shared/types.ts";
import type {
  AdapterContext,
  AdapterModule,
  AdapterVariant,
  ChannelAccountState,
  ChannelAdapter,
} from "./contract.ts";
import { notImplemented } from "./contract.ts";

export function makeSkeleton(family: ChannelFamilyDescriptor): AdapterModule {
  const adapter: ChannelAdapter = {
    async probeHealth() {
      return { status: "ok", details: { skeleton: true } };
    },
    async inspectCapabilities(_ctx: AdapterContext, _account: ChannelAccountState): Promise<CapabilityDescriptor> {
      return family.capabilities;
    },
    async validate(_ctx: AdapterContext, _account: ChannelAccountState, variant: AdapterVariant) {
      const issues: Array<{ code: string; message: string; blocking: boolean; blockIndex?: number }> = [];
      const caps = family.capabilities;
      variant.blocks.forEach((block, idx) => {
        if (typeof block.body !== "string") {
          issues.push({ code: "missing_body", message: "block body must be a string", blocking: true, blockIndex: idx });
          return;
        }
        if (block.body.length > caps.text.maxChars) {
          issues.push({
            code: "text_too_long",
            message: `body exceeds ${caps.text.maxChars} chars`,
            blocking: true,
            blockIndex: idx,
          });
        }
      });
      if (!caps.thread.supported && variant.blocks.length > 1) {
        issues.push({ code: "thread_unsupported", message: "this family does not support multi-block content", blocking: true });
      }
      return { ok: issues.every((i) => !i.blocking), issues };
    },
    async requiredConversions() {
      return [];
    },
    async publish() {
      return notImplemented();
    },
  };
  return { family, adapter };
}
