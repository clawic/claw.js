import { describe, expect, it } from "vitest";

import { computerUseExposedTools } from "./expose.ts";
import type { MacSignedHostBridge } from "./mac-signed-host-bridge.ts";

interface CapturedRequest {
  capabilityId: string;
  actor: { kind: string; id: string };
  host: { hostId: string; bundleId: string };
  arguments: Record<string, unknown>;
  dryRun: boolean;
}

function mockBridge() {
  const calls: CapturedRequest[] = [];
  const bridge: MacSignedHostBridge = {
    execute: async (request) => {
      calls.push(request as unknown as CapturedRequest);
      return { ok: true };
    },
    revert: async () => ({}),
    audit: async () => ({}),
    permissions: async () => ({}),
  };
  return { calls, bridge };
}

describe("computerUseExposedTools", () => {
  it("exposes the full Computer Use action surface", () => {
    const names = computerUseExposedTools(null).map((tool) => tool.name).sort();
    expect(names).toEqual([
      "computer_use.click",
      "computer_use.get_app_state",
      "computer_use.list_apps",
      "computer_use.perform_action",
      "computer_use.press_key",
      "computer_use.scroll",
      "computer_use.set_value",
      "computer_use.type_text",
    ]);
  });

  it("routes click to mac.app.click with the element index preserved", async () => {
    const { calls, bridge } = mockBridge();
    const click = computerUseExposedTools(bridge).find((tool) => tool.name === "computer_use.click")!;
    await click.handler({ app: "TextEdit", element_index: 5 });
    expect(calls[0].capabilityId).toBe("mac.app.click");
    expect(calls[0].arguments).toEqual({ app: "TextEdit", element_index: 5 });
    expect(calls[0].actor.kind).toBe("agent");
    expect(calls[0].dryRun).toBe(false);
  });

  it("omits undefined optional args for get_app_state", async () => {
    const { calls, bridge } = mockBridge();
    const state = computerUseExposedTools(bridge).find((tool) => tool.name === "computer_use.get_app_state")!;
    await state.handler({ app: "Finder" });
    expect(calls[0].capabilityId).toBe("mac.app.state");
    expect(calls[0].arguments).toEqual({ app: "Finder" });
  });

  it("routes type_text and press_key to their capabilities", async () => {
    const { calls, bridge } = mockBridge();
    const tools = computerUseExposedTools(bridge);
    await tools.find((tool) => tool.name === "computer_use.type_text")!.handler({ app: "Notes", text: "hi" });
    await tools.find((tool) => tool.name === "computer_use.press_key")!.handler({ app: "Notes", key: "cmd+s" });
    expect(calls[0].capabilityId).toBe("mac.app.type");
    expect(calls[0].arguments).toEqual({ app: "Notes", text: "hi" });
    expect(calls[1].capabilityId).toBe("mac.app.key");
    expect(calls[1].arguments).toEqual({ app: "Notes", key: "cmd+s" });
  });

  it("fails closed without a signed host bridge", async () => {
    const click = computerUseExposedTools(null).find((tool) => tool.name === "computer_use.click")!;
    const result = (await click.handler({ app: "TextEdit", element_index: 1 })) as { status?: string };
    expect(result.status).toBe("signed_host_required");
  });
});
