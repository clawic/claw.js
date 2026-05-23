import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageHeader, PageBody } from "../components/PageHeader";
import { Card } from "../components/Card";
import { Table, THead, TH, TR, TD, Mono } from "../components/Table";
import { Empty, ErrorMsg, Loading } from "../components/Empty";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

interface DeviceRow {
  deviceId: string;
  userId: string;
  label: string;
  platform: string | null;
  irohNodeId: string | null;
  lastSeenAt: number;
  revokedAt: number | null;
}

function formatTimestamp(value: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const result = await api.get<{ items: DeviceRow[] }>("/devices");
      setDevices(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleRevoke = async (deviceId: string) => {
    if (!window.confirm("Revoke this device? It will be signed out.")) return;
    try {
      await api.del(`/devices/${deviceId}`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <>
      <PageHeader title="Devices" />
      <PageBody>
        <Card title="Registered devices" subtitle="iPhones, Macs, and remote agents in this Relay isolation.">
          {error ? <ErrorMsg message={error} /> : null}
          {devices == null ? <Loading /> : null}
          {devices?.length === 0 ? (
            <Empty
              title="No devices registered yet"
              description="Sign in from Clawix on iPhone or Mac, or issue a pre-auth key to enroll a remote agent."
            />
          ) : null}
          {devices && devices.length > 0 ? (
            <Table>
              <THead>
                <tr>
                  <TH>Label</TH>
                  <TH>Platform</TH>
                  <TH>Iroh node</TH>
                  <TH>Last seen</TH>
                  <TH>Status</TH>
                  <TH className="text-right" />
                </tr>
              </THead>
              <tbody>
                {devices.map((device) => (
                  <TR key={device.deviceId}>
                    <TD>{device.label}</TD>
                    <TD>{device.platform ?? "—"}</TD>
                    <TD>
                      {device.irohNodeId ? <Mono>{device.irohNodeId.slice(0, 14)}…</Mono> : "—"}
                    </TD>
                    <TD>{formatTimestamp(device.lastSeenAt)}</TD>
                    <TD>
                      {device.revokedAt ? (
                        <Badge variant="warn">Revoked</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      {device.revokedAt ? null : (
                        <Button size="sm" variant="ghost" onClick={() => handleRevoke(device.deviceId)}>
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
