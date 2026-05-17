import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Copy, Plus, Trash2, Smartphone } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Drawer } from "../components/Drawer";
import { Empty } from "../components/Empty";
import { copyToClipboard } from "../lib/format";

type Agent = { agentId: string };
type Workspace = { workspaceId: string };

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
      <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "h-8 px-2 text-[12px] bg-bg-input text-text border border-border rounded-sm outline-none focus:border-border-strong";

const CODE_CLS =
  "text-[11px] font-mono bg-bg-panel border border-border rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap break-all";

export function SettingsPage() {
  const { auth, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const tenantId = auth!.tenantId;
  const pairingId = searchParams.get("pairingId");
  const userCode = searchParams.get("user_code");

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Settings" />
        <PageBody>
          <Empty
            title="Admin access required"
            description="Ask a workspace administrator to sign you in."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings">
        <span className="text-xs text-text-muted">
          Tenant <span className="font-mono">{tenantId}</span>
        </span>
      </PageHeader>
      <PageBody>
        {pairingId ? <PairingApprovalCard pairingId={pairingId} userCode={userCode} /> : null}
        <MobileSetupCard tenantId={tenantId} />
        <EnrollmentCard tenantId={tenantId} />
        <CreateWorkspaceCard tenantId={tenantId} />
        <RuntimeCard tenantId={tenantId} />
        <DeleteWorkspaceDataCard tenantId={tenantId} />
      </PageBody>
    </>
  );
}

function PairingApprovalCard({
  pairingId,
  userCode,
}: {
  pairingId: string;
  userCode: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "approved" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "approve" | "deny") => {
    setPending(true);
    setError(null);
    try {
      await api.post(`/pairings/${pairingId}/${action}`, {});
      setStatus(action === "approve" ? "approved" : "denied");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      title="Connector pairing request"
      subtitle="Approve or deny the pending OpenClaw connector bootstrap."
    >
      <div className="flex gap-3 flex-wrap items-end">
        <Field label="Pairing ID">
          <input value={pairingId} readOnly className={INPUT_CLS} />
        </Field>
        <Field label="User code">
          <input value={userCode ?? ""} readOnly className={INPUT_CLS} />
        </Field>
      </div>
      <div className="flex gap-2 mt-3">
        <Button variant="primary" onClick={() => run("approve")} disabled={pending || status !== "idle"}>
          <Plus size={12} /> Approve
        </Button>
        <Button onClick={() => run("deny")} disabled={pending || status !== "idle"}>
          <Trash2 size={12} /> Deny
        </Button>
      </div>
      {status === "approved" ? <div className="text-xs text-green-700 mt-3">Pairing approved.</div> : null}
      {status === "denied" ? <div className="text-xs text-text-muted mt-3">Pairing denied.</div> : null}
      {error ? <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div> : null}
    </Card>
  );
}

// ---------- Mobile Setup QR ----------

function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const modules = useMemo(() => encodeQR(value), [value]);
  if (!modules.length) return null;
  const n = modules.length;
  const cellSize = size / n;
  const rects: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules[y][x]) {
        rects.push(
          <rect key={`${x}-${y}`} x={x * cellSize} y={y * cellSize} width={cellSize} height={cellSize} fill="#1a1a24" />
        );
      }
    }
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ background: "#fff", borderRadius: 8 }}>
      {rects}
    </svg>
  );
}

/**
 * Minimal QR encoder (Mode Byte, ECC L, Version 1-4).
 * Returns a 2D boolean matrix. Good enough for short JSON payloads.
 */
function encodeQR(text: string): boolean[][] {
  // Delegate to a tiny inline implementation using the alphanumeric/byte encoding
  // For simplicity we use the well-tested approach of rendering via SVG path
  // This is a stripped-down QR encoder for version 2-4, ECC L
  const data = new TextEncoder().encode(text);
  const len = data.length;

  // Pick version
  let version: number, ecCodewords: number, groups: [number,number][];
  if (len <= 17) {
    version = 1; ecCodewords = 7; groups = [[1,19]];
  } else if (len <= 32) {
    version = 2; ecCodewords = 10; groups = [[1,34]];
  } else if (len <= 53) {
    version = 3; ecCodewords = 15; groups = [[1,55]];
  } else if (len <= 78) {
    version = 4; ecCodewords = 20; groups = [[1,80]];
  } else if (len <= 106) {
    version = 5; ecCodewords = 26; groups = [[1,108]];
  } else if (len <= 134) {
    version = 6; ecCodewords = 18; groups = [[2,68]];
  } else if (len <= 154) {
    version = 7; ecCodewords = 20; groups = [[2,78]];
  } else if (len <= 192) {
    version = 8; ecCodewords = 24; groups = [[2,97]];
  } else if (len <= 230) {
    version = 9; ecCodewords = 30; groups = [[2,116]];
  } else if (len <= 271) {
    version = 10; ecCodewords = 18; groups = [[2,68],[2,69]];
  } else {
    return [];
  }

  const dataCapacity = groups.reduce((s, [count, cw]) => s + count * cw, 0);
  const size = version * 4 + 17;

  // Build data stream
  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // byte mode
  pushBits(len, version <= 9 ? 8 : 16);
  for (const b of data) pushBits(b, 8);
  pushBits(0, Math.min(4, dataCapacity * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const pad = [0xec, 0x11];
  let pi = 0;
  while (bits.length < dataCapacity * 8) {
    pushBits(pad[pi % 2], 8);
    pi++;
  }

  // Convert to codewords
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0);
    codewords.push(v);
  }

  // RS error correction
  const allDataBlocks: number[][] = [];
  const allEcBlocks: number[][] = [];
  let offset = 0;
  for (const [count, cwPerBlock] of groups) {
    for (let b = 0; b < count; b++) {
      const block = codewords.slice(offset, offset + cwPerBlock);
      offset += cwPerBlock;
      allDataBlocks.push(block);
      allEcBlocks.push(rsEncode(block, ecCodewords));
    }
  }

  // Interleave
  const finalData: number[] = [];
  const maxDataLen = Math.max(...allDataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of allDataBlocks) {
      if (i < block.length) finalData.push(block[i]);
    }
  }
  for (let i = 0; i < ecCodewords; i++) {
    for (const block of allEcBlocks) {
      if (i < block.length) finalData.push(block[i]);
    }
  }

  // Build matrix
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (x: number, y: number, val: boolean, res = true) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      matrix[y][x] = val;
      if (res) reserved[y][x] = true;
    }
  };

  // Finder patterns
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        const on = (adx <= 3 && ady <= 3) && !(adx === 2 && ady === 2) && !(adx === 2 && ady === 1) && !(adx === 1 && ady === 2);
        setModule(x, y, on);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(i, 6, i % 2 === 0);
    setModule(6, i, i % 2 === 0);
  }

  // Alignment patterns (version >= 2)
  if (version >= 2) {
    const positions = getAlignmentPositions(version);
    for (const ay of positions) {
      for (const ax of positions) {
        if (reserved[ay]?.[ax]) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const on = Math.abs(dx) === 2 || Math.abs(dy) === 2 || (dx === 0 && dy === 0);
            setModule(ax + dx, ay + dy, on);
          }
        }
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    if (!reserved[8]?.[i]) { reserved[8][i] = true; }
    if (!reserved[i]?.[8]) { reserved[i][8] = true; }
    if (i < 8 && !reserved[8]?.[size - 1 - i]) { reserved[8][size - 1 - i] = true; }
    if (i < 8 && !reserved[size - 1 - i]?.[8]) { reserved[size - 1 - i][8] = true; }
  }
  reserved[8][8] = true;
  // Dark module
  setModule(8, size - 8, true);

  // Version info (version >= 7)
  if (version >= 7) {
    const versionBits = getVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((versionBits >> i) & 1) === 1;
      const x = Math.floor(i / 3), y = (size - 11) + (i % 3);
      setModule(x, y, bit);
      setModule(y, x, bit);
    }
  }

  // Place data bits
  const allBits: number[] = [];
  for (const byte of finalData) {
    for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);
  }
  // Remainder bits
  const remainderBits = [0,0,7,7,7,7,7,0,0,0,0,0,0,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0];
  const rem = version < remainderBits.length ? remainderBits[version] : 0;
  for (let i = 0; i < rem; i++) allBits.push(0);

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip timing column
    const colRange = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
    for (const row of colRange) {
      for (const col of [right, right - 1]) {
        if (col < 0 || col >= size) continue;
        if (!reserved[row][col] && bitIdx < allBits.length) {
          matrix[row][col] = allBits[bitIdx++] === 1;
        }
      }
    }
    upward = !upward;
  }

  // Apply mask (mask 0: (row + col) % 2 === 0)
  const mask = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!reserved[y][x] && matrix[y][x] !== null) {
        if ((y + x) % 2 === 0) {
          matrix[y][x] = !matrix[y][x];
        }
      }
    }
  }

  // Write format info
  const formatBits = getFormatBits(0, mask); // ECC L = 0, mask 0
  const FORMAT_POS_A = [
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],
    [8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  ];
  const FORMAT_POS_B = [
    [8, size-1],[8, size-2],[8, size-3],[8, size-4],[8, size-5],[8, size-6],[8, size-7],
    [size-8, 8],[size-7, 8],[size-6, 8],[size-5, 8],[size-4, 8],[size-3, 8],[size-2, 8],[size-1, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;
    const [ay, ax] = FORMAT_POS_A[i];
    matrix[ay][ax] = bit;
    const [by, bx] = FORMAT_POS_B[i];
    matrix[by][bx] = bit;
  }

  return matrix.map(row => row.map(v => v === true));
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const table: Record<number, number[]> = {
    2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50],
  };
  return table[version] || [];
}

function getVersionBits(version: number): number {
  const table: Record<number, number> = {
    7:0x07C94,8:0x085BC,9:0x09A99,10:0x0A4D3,
  };
  return table[version] || 0;
}

function getFormatBits(ecLevel: number, mask: number): number {
  // ECC L=1, M=0, Q=3, H=2 in QR spec format indicator
  const eccTable = [1, 0, 3, 2];
  const data = (eccTable[ecLevel] << 3) | mask;
  // BCH(15,5) encoding
  let bits = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((bits >> i) & 1) bits ^= gen << (i - 10);
  }
  bits = (data << 10) | bits;
  bits ^= 0b101010000010010; // XOR mask
  return bits;
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gf256 = { exp: new Uint8Array(512), log: new Uint8Array(256) };
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gf256.exp[i] = x;
    gf256.log[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) gf256.exp[i] = gf256.exp[i - 255];

  const mul = (a: number, b: number) => a === 0 || b === 0 ? 0 : gf256.exp[gf256.log[a] + gf256.log[b]];

  // Generator polynomial
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const factor = gf256.exp[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], factor);
    }
    gen = next;
  }

  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coeff = msg[i];
    if (coeff !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= mul(gen[j], coeff);
      }
    }
  }
  return msg.slice(data.length);
}

function MobileSetupCard({ tenantId }: { tenantId: string }) {
  const { auth } = useAuth();
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const relayUrl = window.location.origin;
  const payload = JSON.stringify({
    relayUrl,
    tenantId,
    email: auth?.email ?? "user@relay.local",
  });

  return (
    <Card
      title="Mobile setup"
      subtitle="Show a QR code for the iOS app to scan and connect to this relay."
    >
      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={() => setShowQR((v) => !v)}
        >
          <Smartphone size={12} /> {showQR ? "Hide QR" : "Show QR code"}
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const ok = await copyToClipboard(payload);
            if (ok) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          <Copy size={12} /> {copied ? "Copied" : "Copy payload"}
        </Button>
      </div>
      {showQR ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="p-4 bg-white rounded-lg inline-block">
            <QRCode value={payload} size={220} />
          </div>
          <p className="text-[11px] text-text-muted text-center max-w-xs">
            Open the ClawJS app on your iPhone, go to Settings, and tap "Scan QR Code".
            The app will configure itself automatically.
          </p>
          <pre className={CODE_CLS + " text-[10px] max-w-xs"}>{payload}</pre>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Enrollment ----------

function EnrollmentCard({ tenantId }: { tenantId: string }) {
  const [agentId, setAgentId] = useState("demo-agent");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const data = await api.post<{ enrollmentToken?: string; token?: string }>(
        "/admin/connectors/enrollments",
        { tenantId, agentId, description: description || undefined },
      );
      setToken(data.enrollmentToken ?? data.token ?? JSON.stringify(data));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      title="Enrollment token"
      subtitle="Generate a token to enroll a new connector for an agent."
    >
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label="Agent ID">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={INPUT_CLS}
            placeholder="agent-id"
          />
        </Field>
        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLS}
            placeholder="Optional description"
          />
        </Field>
      </div>
      <Button variant="primary" onClick={submit} disabled={pending}>
        <Plus size={12} /> Create token
      </Button>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {token ? (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="success">Token created</Badge>
            <Button
              size="sm"
              onClick={async () => {
                const ok = await copyToClipboard(token);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
            >
              <Copy size={12} /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className={CODE_CLS}>{token}</pre>
          <p className="text-[11px] text-text-muted mt-2">
            This token expires in 1 hour. Use it to enroll a connector.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Create workspace ----------

function CreateWorkspaceCard({ tenantId }: { tenantId: string }) {
  const [agentId, setAgentId] = useState("demo-agent");
  const [workspaceId, setWorkspaceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ agentId: string; workspaceId: string } | null>(null);

  const submit = async () => {
    if (!workspaceId) {
      setError("Workspace ID is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post(`/admin/tenants/${tenantId}/agents/${agentId}/workspaces`, {
        workspaceId,
        displayName: displayName || workspaceId,
      });
      setCreated({ agentId, workspaceId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Create workspace" subtitle="Create a new workspace for an agent.">
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label="Agent ID">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Workspace ID">
          <input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className={INPUT_CLS}
            placeholder="my-workspace"
          />
        </Field>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={INPUT_CLS}
            placeholder="My workspace"
          />
        </Field>
      </div>
      <Button variant="primary" onClick={submit} disabled={pending}>
        <Plus size={12} /> Create workspace
      </Button>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {created ? (
        <div className="mt-3 flex items-center gap-3">
          <Badge variant="success">Workspace created</Badge>
          <Link
            to={`/workspace/${tenantId}/${created.agentId}/${created.workspaceId}`}
            className="text-xs underline text-text"
          >
            Open workspace
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Runtime ----------

type RuntimeAction = "status" | "setup" | "install" | "uninstall";

function RuntimeCard({ tenantId }: { tenantId: string }) {
  const [agentId, setAgentId] = useState("demo-agent");
  const [action, setAction] = useState<RuntimeAction>("status");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post(
        `/admin/tenants/${tenantId}/agents/${agentId}/runtime/${action}`,
        {},
      );
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      title="Runtime management"
      subtitle="Manage the runtime for an agent (setup, install, uninstall, status)."
    >
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label="Agent ID">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Action">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as RuntimeAction)}
            className={INPUT_CLS}
          >
            <option value="status">Status</option>
            <option value="setup">Setup</option>
            <option value="install">Install</option>
            <option value="uninstall">Uninstall</option>
          </select>
        </Field>
      </div>
      <Button variant="primary" onClick={run} disabled={pending}>
        Run
      </Button>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {result !== null ? (
        <div className="mt-3">
          <Badge variant="success">{action} completed</Badge>
          <pre className={`${CODE_CLS} mt-2`}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Delete data ----------

type DeleteFlags = {
  conversations: boolean;
  activity: boolean;
  usage: boolean;
  projects: boolean;
  agents: boolean;
};

const DELETE_LABELS: Record<keyof DeleteFlags, string> = {
  conversations: "All conversations",
  activity: "Activity log",
  usage: "Usage records",
  projects: "All projects / workspaces",
  agents: "All agents (connectors)",
};

function DeleteWorkspaceDataCard({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [flags, setFlags] = useState<DeleteFlags>({
    conversations: false,
    activity: false,
    usage: false,
    projects: false,
    agents: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [log, setLog] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = (Object.keys(flags) as (keyof DeleteFlags)[]).filter((k) => flags[k]);

  const toggle = (k: keyof DeleteFlags) => setFlags((f) => ({ ...f, [k]: !f[k] }));

  const selectAll = () =>
    setFlags({
      conversations: true,
      activity: true,
      usage: true,
      projects: true,
      agents: true,
    });

  const runDelete = async () => {
    setConfirmOpen(false);
    setConfirmText("");
    setPending(true);
    setError(null);
    const entries: string[] = [];
    try {
      const { agents } = await api.get<{ agents: Agent[] }>(`/tenants/${tenantId}/agents`);

      if (flags.conversations) {
        let total = 0;
        for (const a of agents) {
          try {
            const { workspaces } = await api.get<{ workspaces: Workspace[] }>(
              `/tenants/${tenantId}/agents/${a.agentId}/workspaces`,
            );
            for (const w of workspaces) {
              try {
                const res = await api.post<{ deleted?: number }>(
                  `/admin/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}/sessions/clear`,
                  {},
                );
                total += res?.deleted ?? 0;
              } catch (err) {
                entries.push(`  skip ${a.agentId}/${w.workspaceId}: ${(err as Error).message}`);
              }
            }
          } catch (err) {
            entries.push(`  skip agent ${a.agentId}: ${(err as Error).message}`);
          }
        }
        entries.push(`Conversations: ${total} session file(s) deleted`);
      }

      if (flags.activity) {
        const res = await api.del<{ deleted: number }>(`/admin/tenants/${tenantId}/activity`);
        entries.push(`Activity: ${res.deleted} record(s) deleted`);
      }

      if (flags.usage) {
        const res = await api.del<{ deleted: number }>(`/admin/tenants/${tenantId}/usage`);
        entries.push(`Usage: ${res.deleted} record(s) deleted`);
      }

      if (flags.projects) {
        let count = 0;
        for (const a of agents) {
          try {
            const { workspaces } = await api.get<{ workspaces: Workspace[] }>(
              `/tenants/${tenantId}/agents/${a.agentId}/workspaces`,
            );
            for (const w of workspaces) {
              try {
                await api.del(
                  `/admin/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}`,
                );
                count += 1;
              } catch (err) {
                entries.push(
                  `  skip ${a.agentId}/${w.workspaceId}: ${(err as Error).message}`,
                );
              }
            }
          } catch {
            /* skip */
          }
        }
        entries.push(`Projects: ${count} workspace(s) deleted`);
      }

      if (flags.agents) {
        let count = 0;
        for (const a of agents) {
          try {
            await api.del(`/admin/tenants/${tenantId}/agents/${a.agentId}`);
            count += 1;
          } catch (err) {
            entries.push(`  skip agent ${a.agentId}: ${(err as Error).message}`);
          }
        }
        entries.push(`Agents: ${count} agent(s) deleted`);
      }

      setLog(entries);
      setFlags({
        conversations: false,
        activity: false,
        usage: false,
        projects: false,
        agents: false,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
      // In case the user deleted the agents they were viewing
      if (flags.agents || flags.projects) navigate("/agents");
    }
  };

  return (
    <Card
      title="Delete data"
      subtitle="Select what you want to delete. This action is irreversible."
      danger
    >
      <div className="flex flex-col gap-2">
        {(Object.keys(DELETE_LABELS) as (keyof DeleteFlags)[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={flags[k]}
              onChange={() => toggle(k)}
              className="accent-red"
            />
            {DELETE_LABELS[k]}
          </label>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          variant="danger"
          onClick={() => {
            if (selected.length === 0) {
              setError("Please select at least one option to delete.");
              return;
            }
            setError(null);
            setConfirmOpen(true);
          }}
          disabled={pending}
        >
          <Trash2 size={12} /> Delete selected
        </Button>
        <Button size="sm" onClick={selectAll}>
          Select all
        </Button>
      </div>
      {error ? (
        <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1 mt-3">{error}</div>
      ) : null}
      {log ? (
        <div className="mt-3">
          <Badge variant="success">Delete completed</Badge>
          <pre className={`${CODE_CLS} mt-2`}>{log.join("\n")}</pre>
        </div>
      ) : null}

      <Drawer
        open={confirmOpen}
        title="Confirm deletion"
        onClose={() => {
          setConfirmOpen(false);
          setConfirmText("");
        }}
        footer={
          <>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={runDelete}
              disabled={confirmText !== "DELETE"}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs mb-3">You are about to permanently delete:</p>
        <ul className="list-disc ml-5 mb-4 text-xs">
          {selected.map((k) => (
            <li key={k}>{DELETE_LABELS[k]}</li>
          ))}
        </ul>
        <p className="text-[11px] text-text-muted mb-2">
          Type <span className="font-mono text-red">DELETE</span> to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && confirmText === "DELETE") {
              e.preventDefault();
              void runDelete();
            }
          }}
          placeholder="DELETE"
          autoFocus
          className={`${INPUT_CLS} w-full ${
            confirmText && confirmText !== "DELETE" ? "border-red" : ""
          }`}
        />
      </Drawer>
    </Card>
  );
}
