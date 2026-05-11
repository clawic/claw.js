// Connection manager. Owns one watcher per Connection record, starts /
// stops them in response to `start`/`stop` calls from the daemon, and
// routes inbound messages to the agent identified by the matching
// `AgentIntegrationBinding`. The actual prompt delivery is delegated
// via the `deliver` callback so this module stays free of bridge /
// runtime imports.

import type { Agent, AgentStoreFS, Connection } from "@clawjs/agents";
import { telegramAdapter } from "./telegram.js";
import type {
  IntegrationAdapter,
  IntegrationInboundMessage,
} from "./types.js";

export interface IntegrationDeliveryContext {
  agent: Agent;
  connection: Connection;
  message: IntegrationInboundMessage;
}

export interface IntegrationManagerOptions {
  store: AgentStoreFS;
  /** Invoked once for every inbound message that resolved to an agent.
   *  Implementations send the text into the agent's runtime
   *  (typically `RuntimeAdapter.sendPrompt`) and persist a chat
   *  transcript. The dispatcher catches and logs throws so a single
   *  bad delivery never kills the watcher loop. */
  deliver: (ctx: IntegrationDeliveryContext) => void | Promise<void>;
  adapters?: Partial<Record<Connection["service"], IntegrationAdapter>>;
}

const DEFAULT_ADAPTERS: Partial<Record<Connection["service"], IntegrationAdapter>> = {
  telegram: telegramAdapter,
};

export class IntegrationManager {
  private readonly store: AgentStoreFS;
  private readonly deliver: IntegrationManagerOptions["deliver"];
  private readonly adapters: Partial<Record<Connection["service"], IntegrationAdapter>>;
  private stops: Map<string, () => void> = new Map();

  constructor(opts: IntegrationManagerOptions) {
    this.store = opts.store;
    this.deliver = opts.deliver;
    this.adapters = { ...DEFAULT_ADAPTERS, ...(opts.adapters ?? {}) };
  }

  /** Start watchers for every connection that already has a stored
   *  auth secret. Connections without auth are skipped silently —
   *  they'll come online the moment the user pastes a token. */
  async startAll(): Promise<void> {
    for (const conn of this.store.listConnections()) {
      await this.startOne(conn.id);
    }
  }

  async startOne(connectionId: string): Promise<boolean> {
    const conn = this.store.readConnection(connectionId);
    if (!conn) return false;
    const auth = this.store.readConnectionAuth(connectionId);
    if (!auth) return false;
    const adapter = this.adapters[conn.service];
    if (!adapter) return false;
    if (this.stops.has(connectionId)) return true;
    const stop = await adapter.start({
      connection: conn,
      auth,
      onMessage: (msg) => this.routeMessage(msg),
    });
    this.stops.set(connectionId, stop);
    return true;
  }

  stopOne(connectionId: string): void {
    const stop = this.stops.get(connectionId);
    if (stop) {
      stop();
      this.stops.delete(connectionId);
    }
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.stops.keys()]) {
      this.stopOne(id);
    }
  }

  /** Push an outbound message through the matching adapter. Returns
   *  false when the connection has no auth on disk yet or the service
   *  isn't supported. */
  async send(connectionId: string, channelRef: string, text: string): Promise<boolean> {
    const conn = this.store.readConnection(connectionId);
    if (!conn) return false;
    const auth = this.store.readConnectionAuth(connectionId);
    if (!auth) return false;
    const adapter = this.adapters[conn.service];
    if (!adapter) return false;
    await adapter.send({
      connection: conn,
      auth,
      message: { connectionId, channelRef, text },
    });
    return true;
  }

  /** Resolve a routing target. Picks the first agent whose
   *  IntegrationBinding matches the inbound `(connectionId,
   *  channelRef)`; ties are broken by enumeration order on
   *  `AgentStoreFS.listAgents` (built-ins first, then alpha by name)
   *  which matches what the macOS UI displays. */
  private routeMessage(msg: IntegrationInboundMessage): void {
    const conn = this.store.readConnection(msg.connectionId);
    if (!conn) return;
    for (const agent of this.store.listAgents()) {
      const match = agent.integrationBindings.find(
        (b) =>
          b.connectionId === msg.connectionId &&
          b.channelRef === msg.channelRef &&
          b.direction !== "outbound",
      );
      if (!match) continue;
      Promise.resolve(this.deliver({ agent, connection: conn, message: msg })).catch(
        (err) => {
          // Telemetry hook lands here once `@clawjs/core` exports a
          // shared logger. For now, surface to stderr so a misrouted
          // prompt is visible in the daemon logs without crashing.
          // eslint-disable-next-line no-console
          console.error(
            "[clawjs-integrations] delivery failed",
            { connectionId: msg.connectionId, channelRef: msg.channelRef, externalId: msg.externalId },
            err,
          );
        },
      );
      return;
    }
  }
}
