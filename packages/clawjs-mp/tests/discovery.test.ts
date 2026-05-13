// Discovery: in-memory Iroh DHT, federated broker, loopback stream.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalizeIntent, signIntent,
} from "../src/wire.ts";
import { generateEd25519Keypair } from "../src/identity.ts";
import {
  IrohDht, InMemoryIrohAdapter, InMemoryDht,
} from "../src/discovery/dht.ts";
import {
  InProcessBroker, RemoteBrokerClient, FederatedBrokerClient,
  encodeBrokerQueryResponse, decodeBrokerQueryRequest,
  publishIntent,
} from "../src/discovery/brokers.ts";
import { createLoopbackPair } from "../src/discovery/stream.ts";
import { InMemoryGossip } from "../src/discovery/gossip.ts";

function makeIntent(): { intent: ReturnType<typeof canonicalizeIntent>["intent"]; payloadCbor: Uint8Array } {
  const role = generateEd25519Keypair();
  const device = generateEd25519Keypair();
  const { intent, payloadCbor } = canonicalizeIntent({
    side: "offer",
    vertical: "item/v1",
    fields: { title: "Bike", geo_zone: "u4pr", category: "bikes", price_band: 2 },
    visibility: { title: 0, geo_zone: 0, category: 0, price_band: 0 },
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    rolePubkey: role.publicKey,
  });
  signIntent({ intent, payloadCbor, rolePrivate: role.privateKey, devicePrivate: device.privateKey });
  return { intent, payloadCbor };
}

test("IrohDht: publish + query via InMemoryIrohAdapter", async () => {
  const adapter = new InMemoryIrohAdapter();
  const dht = new IrohDht({ adapter });
  const { intent } = makeIntent();
  await dht.publish(intent);
  const back = await dht.query({ vertical: "item/v1", geoZone: "u4pr", tag: "bikes", priceBand: 2 });
  assert.equal(back.length, 1);
  assert.equal(back[0].vertical, "item/v1");
});

test("Federation: RemoteBrokerClient round-trips publish + query against a real server", async () => {
  const local = new InProcessBroker();
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = (typeof url === "string" ? url : (url as URL).toString()).split("?")[0];
    const body = init?.body as ArrayBuffer | ArrayBufferView;
    if (u.endsWith("/mp/publish")) {
      const buf = body instanceof Uint8Array ? body : new Uint8Array(body as ArrayBuffer);
      const { decodeEnvelope } = await import("../src/wire.ts");
      const env = decodeEnvelope(buf);
      local.publish(env);
      return new Response(null, { status: 204 });
    }
    if (u.endsWith("/mp/query")) {
      const buf = body instanceof Uint8Array ? body : new Uint8Array(body as ArrayBuffer);
      const { discoveryKey, limit } = decodeBrokerQueryRequest(buf);
      const intents = local.query({ discoveryKey, limit });
      const out = encodeBrokerQueryResponse(intents);
      return new Response(out as BodyInit, { status: 200, headers: { "Content-Type": "application/cbor" } });
    }
    return new Response("not found", { status: 404 });
  };
  const remote = new RemoteBrokerClient({ baseUrl: "https://broker.local", fetchImpl });
  const { intent } = makeIntent();
  await remote.publish(intent);
  const back = await remote.query({
    discoveryKey: (await import("../src/wire.ts")).discoveryKey({
      vertical: "item/v1", geoZone: "u4pr", tag: "bikes", priceBand: 2,
    }),
  });
  assert.equal(back.length, 1);
});

test("Federation: FederatedBrokerClient unions local and remote results without duplicates", async () => {
  const local = new InProcessBroker();
  const { intent } = makeIntent();
  publishIntent(local, intent);
  // remote returns the SAME intent.
  const fetchImpl: typeof fetch = async (_url, _init) => {
    return new Response(encodeBrokerQueryResponse([intent]) as BodyInit, {
      status: 200, headers: { "Content-Type": "application/cbor" },
    });
  };
  const fed = new FederatedBrokerClient(
    [new RemoteBrokerClient({ baseUrl: "https://broker.local", fetchImpl })],
    local,
  );
  const back = await fed.query({
    discoveryKey: (await import("../src/wire.ts")).discoveryKey({
      vertical: "item/v1", geoZone: "u4pr", tag: "bikes", priceBand: 2,
    }),
  });
  assert.equal(back.length, 1);
});

test("Loopback stream: send/recv round-trips a CborValue", async () => {
  const { a, b } = createLoopbackPair();
  const received: { kind: string; payload: unknown }[] = [];
  b.onMessage((m) => received.push(m));
  await a.send({ kind: "ping", payload: { hello: "world" } });
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, "ping");
  assert.deepEqual(received[0].payload, { hello: "world" });
  await a.close();
});

test("Gossip: InMemoryGossip delivers announced intents to observers", async () => {
  const g = new InMemoryGossip();
  const { intent } = makeIntent();
  let seen = 0;
  g.observe(() => { seen += 1; });
  await g.announce(intent);
  assert.equal(seen, 1);
});

test("InMemoryDht still works (legacy implementation)", async () => {
  const dht = new InMemoryDht();
  const { intent } = makeIntent();
  await dht.publish(intent);
  const back = await dht.query({ vertical: "item/v1", geoZone: "u4pr", tag: "bikes", priceBand: 2 });
  assert.equal(back.length, 1);
});
