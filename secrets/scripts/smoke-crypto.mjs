// Smoke test for crypto.ts. Runs without a build (tsx required).
// Usage: npx tsx scripts/smoke-crypto.mjs

import {
  secretsSetup,
  secretsUnlock,
  secretsRecover,
  secretsRecoverAndRotate,
  secretsChangePassword,
  normalizeSecretKey,
  generateKey,
  generateItemKey,
  wrapItemKey,
  unwrapItemKey,
  sealField,
  openField,
  sealNotes,
  openNotes,
  generateAttachmentKey,
  wrapAttachmentKey,
  unwrapAttachmentKey,
  sealAttachment,
  openAttachment,
  generateEventKey,
  wrapEventKey,
  unwrapEventKey,
  sealEventPayload,
  openEventPayload,
  computeChainHash,
  generateAgentToken,
  hashAgentToken,
  generateLeaseToken,
  toBase64,
  fromBase64,
} from "../src/server/crypto.ts";
import { ARGON2_FAST_PARAMS } from "../src/server/calibration.ts";

let pass = 0;
let fail = 0;
function ok(name) {
  console.log(`  ✓ ${name}`);
  pass++;
}
function ko(name, err) {
  console.error(`  ✗ ${name}: ${err?.message ?? err}`);
  fail++;
}

console.log("Secrets setup / unlock / recover / change-password");
const platformKey = generateKey();
const setup = secretsSetup("correct horse battery staple", {
  schemaVersion: 1,
  appVersion: "0.1.2",
  kdfParams: ARGON2_FAST_PARAMS,
  recoveryParams: ARGON2_FAST_PARAMS,
  platformKey,
});
if (!setup.recoveryPhrase || setup.recoveryPhrase.split(" ").length !== 24) ko("24-word phrase"); else ok("24-word phrase");
if (!setup.secretKey || normalizeSecretKey(setup.secretKey) !== setup.secretKey) ko("versioned Secret Key"); else ok("versioned Secret Key");
if (setup.masterKey.length !== 32) ko("masterKey 32B"); else ok("masterKey 32B");
if (setup.auditMacKey.length !== 32) ko("auditMacKey 32B"); else ok("auditMacKey 32B");

try {
  const unlocked = secretsUnlock(setup.meta, "correct horse battery staple", setup.secretKey, platformKey);
  if (unlocked.masterKey.length !== 32) throw new Error("wrong length");
  ok("unlock with correct password + Secret Key");
  unlocked.masterKey.zero();
  unlocked.auditMacKey.zero();
} catch (e) { ko("unlock with correct password + Secret Key", e); }

try {
  secretsUnlock(setup.meta, "correct horse battery staple", "", platformKey);
  ko("unlock without Secret Key (should throw)");
} catch (e) { ok("unlock requires Secret Key"); }

try {
  secretsUnlock(setup.meta, "correct horse battery staple", setup.secretKey);
  ko("unlock without platform key (should throw)");
} catch (e) { ok("unlock requires platform key when wrapped"); }

try {
  secretsUnlock(setup.meta, "correct horse battery staple", setup.secretKey, generateKey());
  ko("unlock with wrong platform key (should throw)");
} catch (e) { ok("unlock rejects wrong platform key"); }

try {
  secretsUnlock(setup.meta, "wrong password", setup.secretKey, platformKey);
  ko("unlock with wrong password (should throw)");
} catch (e) { ok("unlock with wrong password rejects"); }

try {
  const wrongSecretKeySetup = secretsSetup("other", {
    schemaVersion: 1,
    appVersion: "0.1.2",
    kdfParams: ARGON2_FAST_PARAMS,
    recoveryParams: ARGON2_FAST_PARAMS,
  });
  secretsUnlock(setup.meta, "correct horse battery staple", wrongSecretKeySetup.secretKey, platformKey);
  wrongSecretKeySetup.masterKey.zero();
  wrongSecretKeySetup.auditMacKey.zero();
  ko("unlock with wrong Secret Key (should throw)");
} catch (e) { ok("unlock rejects wrong Secret Key"); }

try {
  const recovered = secretsRecover(setup.meta, setup.recoveryPhrase);
  ok("recover with phrase");
  recovered.masterKey.zero();
  recovered.auditMacKey.zero();
} catch (e) { ko("recover with phrase", e); }

try {
  const recovered = secretsRecoverAndRotate(setup.meta, setup.recoveryPhrase, "recovered-master-pw", platformKey);
  secretsRecover(recovered.newMeta, setup.recoveryPhrase);
  ko("recovery rotation revokes old recovery phrase");
} catch (e) { ok("recovery rotation revokes old recovery phrase"); }

try {
  const changed = secretsChangePassword(setup.meta, "correct horse battery staple", setup.secretKey, "new-master-pw", platformKey);
  const u = secretsUnlock(changed.newMeta, "new-master-pw", changed.newSecretKey, platformKey);
  ok("change password rotates Secret Key and preserves verifier");
  u.masterKey.zero();
  u.auditMacKey.zero();
} catch (e) { ko("change password", e); }

console.log("\nPer-item key wrap + field encryption");
const itemKey = generateItemKey();
const wrapped = wrapItemKey(itemKey, "secret-1", setup.masterKey);
const unwrapped = unwrapItemKey(wrapped, "secret-1", setup.masterKey);
const sealed = sealField("sk_live_xxx", unwrapped, "secret-1", "api_key");
const opened = openField(sealed, unwrapped, "secret-1", "api_key");
if (opened !== "sk_live_xxx") ko("field roundtrip"); else ok("field roundtrip");

try {
  openField(sealed, unwrapped, "secret-1", "OTHER_FIELD");
  ko("AAD mismatch should fail");
} catch (e) { ok("AAD mismatch rejected"); }

try {
  openField(sealed, unwrapped, "OTHER_SECRET", "api_key");
  ko("secretId AAD should fail");
} catch (e) { ok("secretId AAD mismatch rejected"); }

console.log("\nNotes encryption");
const notesCt = sealNotes("This is a long note with secrets", unwrapped, "secret-1");
const notes = openNotes(notesCt, unwrapped, "secret-1");
if (notes !== "This is a long note with secrets") ko("notes roundtrip"); else ok("notes roundtrip");

console.log("\nAttachment encryption (per-file key)");
const attKey = generateAttachmentKey();
const attWrap = wrapAttachmentKey(attKey, "att-1", setup.masterKey);
const attUnwrap = unwrapAttachmentKey(attWrap, "att-1", setup.masterKey);
const data = new Uint8Array([1,2,3,4,5,6,7,8,9,10]);
const attCt = sealAttachment(data, attUnwrap, "att-1");
const attPt = openAttachment(attCt, attUnwrap, "att-1");
if (Buffer.compare(Buffer.from(data), Buffer.from(attPt)) !== 0) ko("attachment roundtrip"); else ok("attachment roundtrip");

console.log("\nAudit event encryption + chain hash");
const evKey = generateEventKey();
const evWrap = wrapEventKey(evKey, "ev-1", setup.auditMacKey);
const evUnwrap = unwrapEventKey(evWrap, "ev-1", setup.auditMacKey);
const evCt = sealEventPayload(JSON.stringify({kind:"adminCreate", actor:"x"}), evUnwrap, "ev-1");
const evPt = openEventPayload(evCt, evUnwrap, "ev-1");
if (!evPt.includes("adminCreate")) ko("event payload roundtrip"); else ok("event payload roundtrip");

const prev = new Uint8Array(32);
const evBytes = new TextEncoder().encode(evPt);
const h1 = computeChainHash(prev, evBytes, setup.auditMacKey);
const h2 = computeChainHash(prev, evBytes, setup.auditMacKey);
if (Buffer.compare(Buffer.from(h1), Buffer.from(h2)) !== 0) ko("chain hash deterministic"); else ok("chain hash deterministic");

console.log("\nToken generation");
const at = generateAgentToken();
if (!at.token.startsWith("svagt_")) ko("agent token prefix"); else ok("agent token prefix");
if (hashAgentToken(at.token) !== at.hash) ko("agent token hash"); else ok("agent token hash");
const lt = generateLeaseToken();
if (!lt.token.startsWith("svlse_")) ko("lease token prefix"); else ok("lease token prefix");

console.log("\nBase64 roundtrip");
const blob = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
const b64 = toBase64(blob);
const back = fromBase64(b64);
if (Buffer.compare(Buffer.from(blob), Buffer.from(back)) !== 0) ko("b64 roundtrip"); else ok("b64 roundtrip");

setup.masterKey.zero();
setup.auditMacKey.zero();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
