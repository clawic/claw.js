// In-process registry of connector adapters.
//
// `app.ts` constructs the registry, registers every built-in adapter on
// startup, and hands the registry to:
//   - `IotServiceStore` via the `adapterDispatch` callback so successful
//     `runAction` calls fan out to the live device.
//   - `DiscoveryOrchestrator` so mDNS hits can match by service type
//     against the right adapter.
//   - The tools module so `iot.connectors.list` enumerates what is
//     loaded.
//
// The registry is intentionally untyped beyond the `ConnectorAdapter`
// interface; adapter-specific configuration (URLs, vendor credentials,
// MQTT topics) lives on `DeviceRecord.metadata` and is the adapter's
// problem to validate.

import type {
  ConnectorAdapter,
  DispatchContext,
  DispatchResult,
} from "./types.ts";

export class AdapterRegistry {
  private adapters = new Map<string, ConnectorAdapter>();

  /** Replace-on-duplicate so hot-reload paths (Phase 4 user-installed
   *  adapters) can swap a connector without restarting the daemon. */
  register(adapter: ConnectorAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  unregister(id: string): void {
    this.adapters.delete(id);
  }

  get(id: string): ConnectorAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): ConnectorAdapter[] {
    return Array.from(this.adapters.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Fire-and-forget dispatch. Swallows errors after logging so a
   *  failing adapter cannot crash the store thread. The return type is
   *  `Promise<DispatchResult | undefined>`: `undefined` when no adapter
   *  matched the thing's connectorId (the store keeps its optimistic
   *  state and life goes on). */
  async dispatch(context: DispatchContext): Promise<DispatchResult | undefined> {
    const adapter = this.adapters.get(context.thing.connectorId);
    if (!adapter) {
      return undefined;
    }
    try {
      return await adapter.dispatch(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[iot] adapter ${adapter.id} failed to dispatch ${context.action} on ${context.thing.id}: ${message}`,
      );
      return { observedValue: context.desiredValue, note: `dispatch_failed: ${message}` };
    }
  }
}
