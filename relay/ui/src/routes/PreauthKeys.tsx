import { useEffect, useState } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageHeader, PageBody } from "../components/PageHeader";
import { Card } from "../components/Card";
import { Table, THead, TH, TR, TD, Mono } from "../components/Table";
import { Empty, ErrorMsg, Loading } from "../components/Empty";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

interface PreauthKey {
  keyId: string;
  label: string | null;
  scopes: string[];
  reusable: boolean;
  maxUses: number | null;
  uses: number;
  expiresAt: number | null;
  revokedAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
}

interface NewKeyResult {
  keyId: string;
  token: string;
  expiresAt: number | null;
}

function formatTimestamp(value: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function PreauthKeysPage() {
  const [items, setItems] = useState<PreauthKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [reusable, setReusable] = useState(false);
  const [ttlSec, setTtlSec] = useState(60 * 60 * 24);
  const [issued, setIssued] = useState<NewKeyResult | null>(null);

  const refresh = async () => {
    try {
      const result = await api.get<{ items: PreauthKey[] }>("/auth/preauth-keys");
      setItems(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreate = async () => {
    try {
      const result = await api.post<NewKeyResult>("/auth/preauth-keys", {
        label: label || undefined,
        reusable,
        ttlSec: ttlSec || undefined,
      });
      setIssued(result);
      setLabel("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!window.confirm("Revoke this pre-auth key?")) return;
    try {
      await api.del(`/auth/preauth-keys/${keyId}`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <>
      <PageHeader title="Pre-auth keys" />
      <PageBody>
        <Card title="Issue a new key" subtitle="Used for headless agents that cannot complete a magic-link flow.">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col text-xs">
              <span className="text-text-muted">Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="prod-linux-agent"
                className="bg-bg-panel border border-border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs">
              <span className="text-text-muted">TTL (sec)</span>
              <input
                type="number"
                min={60}
                value={ttlSec}
                onChange={(event) => setTtlSec(Number(event.target.value))}
                className="bg-bg-panel border border-border rounded px-2 py-1 w-28 text-sm"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={reusable}
                onChange={(event) => setReusable(event.target.checked)}
              />
              Reusable
            </label>
            <Button variant="primary" onClick={handleCreate}>
              <PlusCircle size={14} /> Create
            </Button>
          </div>
          {issued ? (
            <div className="mt-3 p-2.5 rounded border border-border bg-bg-panel text-xs">
              <div className="text-text-muted mb-1">Copy now (will not be shown again):</div>
              <Mono>{issued.token}</Mono>
            </div>
          ) : null}
        </Card>
        <Card title="Active keys">
          {error ? <ErrorMsg message={error} /> : null}
          {items == null ? <Loading /> : null}
          {items?.length === 0 ? (
            <Empty title="No pre-auth keys yet" description="Issue one above to enroll a remote agent." />
          ) : null}
          {items && items.length > 0 ? (
            <Table>
              <THead>
                <tr>
                  <TH>Label</TH>
                  <TH>Scopes</TH>
                  <TH>Uses</TH>
                  <TH>Expires</TH>
                  <TH>Status</TH>
                  <TH className="text-right" />
                </tr>
              </THead>
              <tbody>
                {items.map((key) => (
                  <TR key={key.keyId}>
                    <TD>{key.label ?? "—"}</TD>
                    <TD><Mono>{key.scopes.length} scopes</Mono></TD>
                    <TD>
                      {key.uses}
                      {key.maxUses != null ? ` / ${key.maxUses}` : ""}
                    </TD>
                    <TD>{formatTimestamp(key.expiresAt)}</TD>
                    <TD>
                      {key.revokedAt ? (
                        <Badge variant="warn">Revoked</Badge>
                      ) : key.reusable ? (
                        <Badge variant="info">Reusable</Badge>
                      ) : (
                        <Badge variant="success">Single-use</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      {key.revokedAt ? null : (
                        <Button size="sm" variant="ghost" onClick={() => handleRevoke(key.keyId)}>
                          <Trash2 size={14} /> Revoke
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : null}
        </Card>
      </PageBody>
    </>
  );
}
