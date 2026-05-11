import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * Wrapper around an Iroh node embedded in the bridge daemon.
 *
 * The real implementation uses the iroh-ffi NAPI bindings exported as
 * `@n0/iroh`. When that module is not present (development boxes that haven't
 * fetched the native binary yet), we fall back to a stub that still exposes
 * a deterministic `nodeId` and the duplex BiStream API so callers can wire
 * up plumbing without crashing.
 */
export interface IrohBiStream extends EventEmitter {
  send(payload: Buffer): Promise<void>;
  close(): void;
}

export interface IrohRemote {
  nodeId: string;
  relayUrl?: string | null;
  publicAddrs?: string[];
}

export interface IrohNodeOptions {
  relayUrl?: string;
  enableDirectAddrs?: boolean;
}

export interface IrohNode {
  readonly nodeId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  describeEndpoint(): Promise<{
    nodeId: string;
    relayUrl: string | null;
    publicAddrs: string[];
  }>;
  connect(remote: IrohRemote): Promise<IrohBiStream>;
  onInbound(handler: (stream: IrohBiStream, from: IrohRemote) => void): void;
}

type IrohFfiModule = {
  Node: new (options: {
    enableDirectAddrs?: boolean;
    relayUrl?: string;
  }) => IrohFfiNode;
};

interface IrohFfiNode {
  nodeId(): string;
  start(): Promise<void>;
  shutdown(): Promise<void>;
  homeRelay(): Promise<string | null>;
  directAddresses(): Promise<string[]>;
  connect(nodeId: string, relayUrl?: string): Promise<IrohFfiStream>;
  onInbound(handler: (stream: IrohFfiStream, fromNodeId: string) => void): void;
}

interface IrohFfiStream {
  send(payload: Buffer): Promise<void>;
  recv(): AsyncIterableIterator<Buffer>;
  close(): Promise<void>;
}

async function tryLoadIrohFfi(): Promise<IrohFfiModule | null> {
  try {
    const mod = (await import("@n0/iroh").catch(() => null)) as
      | { default?: IrohFfiModule }
      | IrohFfiModule
      | null;
    if (!mod) return null;
    return ((mod as { default?: IrohFfiModule }).default ?? mod) as IrohFfiModule;
  } catch {
    return null;
  }
}

class StubBiStream extends EventEmitter implements IrohBiStream {
  async send(payload: Buffer): Promise<void> {
    this.emit("_outbound", payload);
  }
  close(): void {
    this.emit("close");
  }
}

class StubIrohNode implements IrohNode {
  readonly nodeId: string;
  private handler: ((stream: IrohBiStream, from: IrohRemote) => void) | null = null;
  constructor(private readonly options: IrohNodeOptions) {
    this.nodeId = `stub-${randomBytes(16).toString("hex")}`;
  }
  async start(): Promise<void> {
    // No native node yet; behave as enabled but degrade to LAN/WS in callers.
  }
  async stop(): Promise<void> {
    /* nothing to do */
  }
  async describeEndpoint() {
    return {
      nodeId: this.nodeId,
      relayUrl: this.options.relayUrl ?? null,
      publicAddrs: [] as string[],
    };
  }
  async connect(_remote: IrohRemote): Promise<IrohBiStream> {
    throw new Error("iroh-ffi unavailable: install `@n0/iroh` to enable P2P streams");
  }
  onInbound(handler: (stream: IrohBiStream, from: IrohRemote) => void): void {
    this.handler = handler;
  }
}

class NativeIrohNode implements IrohNode {
  readonly nodeId: string;
  constructor(private readonly inner: IrohFfiNode) {
    this.nodeId = inner.nodeId();
  }
  async start(): Promise<void> {
    await this.inner.start();
  }
  async stop(): Promise<void> {
    await this.inner.shutdown();
  }
  async describeEndpoint() {
    const [relay, addrs] = await Promise.all([
      this.inner.homeRelay().catch(() => null),
      this.inner.directAddresses().catch(() => [] as string[]),
    ]);
    return { nodeId: this.nodeId, relayUrl: relay ?? null, publicAddrs: addrs };
  }
  async connect(remote: IrohRemote): Promise<IrohBiStream> {
    const native = await this.inner.connect(remote.nodeId, remote.relayUrl ?? undefined);
    return adaptNativeStream(native);
  }
  onInbound(handler: (stream: IrohBiStream, from: IrohRemote) => void): void {
    this.inner.onInbound((stream, fromNodeId) => {
      const wrapped = adaptNativeStream(stream);
      handler(wrapped, { nodeId: fromNodeId });
    });
  }
}

function adaptNativeStream(stream: IrohFfiStream): IrohBiStream {
  const emitter = new (class extends EventEmitter implements IrohBiStream {
    async send(payload: Buffer): Promise<void> {
      await stream.send(payload);
    }
    close(): void {
      void stream.close().catch(() => undefined);
    }
  })();
  void (async () => {
    try {
      for await (const chunk of stream.recv()) {
        emitter.emit("data", chunk);
      }
      emitter.emit("end");
    } catch (error) {
      emitter.emit("error", error);
    }
  })();
  return emitter;
}

export async function createIrohNode(options: IrohNodeOptions = {}): Promise<IrohNode> {
  const ffi = await tryLoadIrohFfi();
  if (!ffi) return new StubIrohNode(options);
  try {
    const inner = new ffi.Node({
      enableDirectAddrs: options.enableDirectAddrs ?? true,
      ...(options.relayUrl ? { relayUrl: options.relayUrl } : {}),
    });
    return new NativeIrohNode(inner);
  } catch {
    return new StubIrohNode(options);
  }
}
