"use client";

import { clawNotifyEventTypes } from "@clawjs/core";
import * as React from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  Inbox,
  Layers,
  Monitor,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Smartphone,
  Sparkles,
  SquareStack,
  Waves,
} from "lucide-react";

import type { NotifyDashboardData, NotifyFeedItem } from "@/lib/notify-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(value?: string | null) {
  if (!value) return "\u2014";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMinutes(totalMinutes: number) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseTimeString(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(1_439, hours * 60 + minutes));
}

type Section = "inbox" | "preferences" | "apps" | "operations" | "glances";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "preferences", label: "Preferences", icon: Settings2 },
  { id: "apps", label: "Apps", icon: SquareStack },
  { id: "operations", label: "Operations", icon: Layers },
  { id: "glances", label: "Glances", icon: Monitor },
];

/* ------------------------------------------------------------------ */
/*  Micro-components                                                   */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold text-foreground">{value}</div>
      </div>
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-[18px]" />
      </div>
    </div>
  );
}

function SectionHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="h-9 whitespace-nowrap bg-background px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:rounded-tl last:rounded-tr">
      {children}
    </th>
  );
}

function TableCell({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`h-10 px-3 align-middle text-[13px] text-foreground ${className}`}>{children}</td>;
}

function StateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    acked: "bg-success/15 text-success",
    read: "bg-success/15 text-success",
    delivered: "bg-primary/15 text-primary",
    queued: "bg-warning/15 text-warning",
    pending: "bg-warning/15 text-warning",
    active: "bg-primary/15 text-primary",
    failed: "bg-danger/15 text-danger",
    expired: "bg-danger/15 text-danger",
    cancelled: "bg-danger/15 text-danger",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${colors[state] ?? "bg-muted text-muted-foreground"}`}>
      {state}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: "bg-danger/15 text-danger",
    "time-sensitive": "bg-warning/15 text-warning",
    normal: "bg-muted text-muted-foreground",
    passive: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${colors[priority] ?? "bg-muted text-muted-foreground"}`}>
      {priority}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function NotifyDashboard() {
  const [data, setData] = React.useState<NotifyDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [mutating, setMutating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<Section>("inbox");
  const [selectedFeedId, setSelectedFeedId] = React.useState<string | null>(null);
  const [criticalOnly, setCriticalOnly] = React.useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = React.useState(false);
  const [quietStart, setQuietStart] = React.useState("22:00");
  const [quietEnd, setQuietEnd] = React.useState("07:00");
  const [allowCritical, setAllowCritical] = React.useState(true);
  const [subscriptionForm, setSubscriptionForm] = React.useState({
    sourceAppId: "ops-center",
    agentId: "deploy-agent",
    eventType: "",
    severity: "",
    minPriority: "normal",
    action: "allow",
  });
  const [sourceAppForm, setSourceAppForm] = React.useState({
    id: "",
    displayName: "",
    description: "",
  });
  const [clientAppForm, setClientAppForm] = React.useState({
    id: "",
    displayName: "",
    platform: "ios",
    bundleId: "",
  });
  const [manualNotificationForm, setManualNotificationForm] = React.useState({
    sourceAppId: "ops-center",
    priority: "normal",
    title: "Manual notification",
    body: "Triggered from the Notify admin panel.",
    agentId: "manual-agent",
    eventType: clawNotifyEventTypes.manualTriggered,
    severity: "info",
    projectId: "manual-project",
  });

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/notify/dashboard");
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json();
      setData(payload);
      setCriticalOnly(payload.preferences?.criticalOnly ?? false);
      const qh = payload.preferences?.quietHours;
      setQuietHoursEnabled(qh?.enabled ?? false);
      setQuietStart(qh ? formatMinutes(qh.startMinute) : "22:00");
      setQuietEnd(qh ? formatMinutes(qh.endMinute) : "07:00");
      setAllowCritical(qh?.allowCritical ?? true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function mutate(body: Record<string, unknown>) {
    setMutating(true);
    setError(null);
    try {
      const response = await fetch("/api/notify/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutating(false);
    }
  }

  React.useEffect(() => {
    loadDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="size-5 animate-spin" />
          <span className="text-sm">Loading Notify dashboard...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <ShieldAlert className="size-10 text-danger" />
        <p className="max-w-md text-center text-sm text-muted-foreground">{error}</p>
        <Button size="sm" onClick={loadDashboard}>Retry</Button>
      </div>
    );
  }

  if (!data) return null;

  const selectedFeed = data.feed.find((f) => f.delivery.id === selectedFeedId);

  /* ------------------------------------------------------------------ */
  /*  Section renderers                                                  */
  /* ------------------------------------------------------------------ */

  function renderInbox() {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Notifications" value={data!.metrics.notifications} icon={Bell} />
          <StatCard label="Deliveries" value={data!.metrics.deliveries} icon={Send} />
          <StatCard label="Pending Receipts" value={data!.metrics.pendingReceipts} icon={BellRing} />
          <StatCard label="Failed" value={data!.metrics.failedDeliveries} icon={ShieldAlert} />
        </div>

        <Panel>
          <SectionHeader title="Feed" description="Recent notification deliveries for the current user.">
            <Button variant="ghost" size="xs" disabled={loading || mutating} onClick={loadDashboard}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </SectionHeader>
          {data!.feed.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="space-y-2">
              {data!.feed.map((item: NotifyFeedItem) => (
                <button
                  key={item.delivery.id}
                  onClick={() => setSelectedFeedId(item.delivery.id === selectedFeedId ? null : item.delivery.id)}
                  className={`w-full rounded-md border px-4 py-3 text-left transition-colors ${
                    item.delivery.id === selectedFeedId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-foreground">{item.notification.title ?? "(untitled)"}</span>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={item.notification.priority} />
                      <StateBadge state={item.delivery.state} />
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{item.notification.body}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{item.notification.context.agentId ?? "unknown"}</span>
                    <span>{formatTimestamp(item.delivery.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {selectedFeed && (
          <Panel>
            <SectionHeader title="Delivery Detail" />
            <div className="grid gap-3 text-[13px] sm:grid-cols-2">
              <div><span className="text-muted-foreground">Delivery ID:</span> <span className="font-mono text-[12px]">{selectedFeed.delivery.id}</span></div>
              <div><span className="text-muted-foreground">Notification ID:</span> <span className="font-mono text-[12px]">{selectedFeed.notification.id}</span></div>
              <div><span className="text-muted-foreground">State:</span> <StateBadge state={selectedFeed.delivery.state} /></div>
              <div><span className="text-muted-foreground">Provider:</span> {selectedFeed.delivery.provider}</div>
              <div><span className="text-muted-foreground">Created:</span> {formatTimestamp(selectedFeed.delivery.createdAt)}</div>
              <div><span className="text-muted-foreground">Read at:</span> {formatTimestamp(selectedFeed.delivery.readAt)}</div>
              {selectedFeed.receipt && (
                <>
                  <div><span className="text-muted-foreground">Receipt status:</span> <StateBadge state={selectedFeed.receipt.status} /></div>
                  <div><span className="text-muted-foreground">Acked at:</span> {formatTimestamp(selectedFeed.receipt.ackedAt)}</div>
                </>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              {selectedFeed.delivery.state === "delivered" && (
                <Button size="xs" variant="outline" disabled={mutating} onClick={() => mutate({ intent: "markRead", deliveryId: selectedFeed.delivery.id })}>
                  <CheckCheck className="size-3.5" /> Mark read
                </Button>
              )}
              {selectedFeed.receipt && selectedFeed.receipt.status === "pending" && (
                <Button size="xs" variant="outline" disabled={mutating} onClick={() => mutate({ intent: "ackReceipt", receiptId: selectedFeed.receipt!.id, installationId: data!.installations[0]?.id })}>
                  <CheckCheck className="size-3.5" /> Ack receipt
                </Button>
              )}
            </div>
          </Panel>
        )}
      </div>
    );
  }

  function renderPreferences() {
    return (
      <div className="space-y-6">
        <Panel>
          <SectionHeader title="Delivery Preferences" description="Control which notifications reach this user." />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={criticalOnly}
                onCheckedChange={(v) => setCriticalOnly(v === true)}
              />
              <span className="text-[13px] text-foreground">Critical only mode</span>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={quietHoursEnabled}
                onCheckedChange={(v) => setQuietHoursEnabled(v === true)}
              />
              <span className="text-[13px] text-foreground">Quiet hours</span>
            </div>
            {quietHoursEnabled && (
              <div className="ml-7 grid gap-3 sm:grid-cols-3">
                <div>
                  <FieldLabel>Start</FieldLabel>
                  <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>End</FieldLabel>
                  <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Checkbox checked={allowCritical} onCheckedChange={(v) => setAllowCritical(v === true)} />
                  <span className="text-[13px] text-foreground">Allow critical</span>
                </div>
              </div>
            )}
            <Button
              size="sm"
              disabled={mutating}
              onClick={() =>
                mutate({
                  intent: "updatePreferences",
                  criticalOnly,
                  quietHours: quietHoursEnabled
                    ? {
                        enabled: true,
                        timeZone: "Europe/Madrid",
                        startMinute: parseTimeString(quietStart),
                        endMinute: parseTimeString(quietEnd),
                        allowCritical,
                      }
                    : null,
                })
              }
            >
              Save preferences
            </Button>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Subscriptions" description="Per-source routing rules." />
          {data!.subscriptions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No subscriptions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <TableHead>Source</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Min Priority</TableHead>
                    <TableHead>{""}</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <TableCell>{sub.sourceAppId ?? "\u2014"}</TableCell>
                      <TableCell>{sub.agentId ?? "\u2014"}</TableCell>
                      <TableCell>{sub.workspaceId ?? "\u2014"}</TableCell>
                      <TableCell><StateBadge state={sub.action} /></TableCell>
                      <TableCell>{sub.minPriority ?? "\u2014"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="xs" disabled={mutating} onClick={() => mutate({ intent: "deleteSubscription", id: sub.id })}>
                          Remove
                        </Button>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-3 text-[13px] font-semibold text-foreground">Add subscription</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel>Source App ID</FieldLabel>
                <Input value={subscriptionForm.sourceAppId} onChange={(e) => setSubscriptionForm((f) => ({ ...f, sourceAppId: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Agent ID</FieldLabel>
                <Input value={subscriptionForm.agentId} onChange={(e) => setSubscriptionForm((f) => ({ ...f, agentId: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Min Priority</FieldLabel>
                <Input value={subscriptionForm.minPriority} onChange={(e) => setSubscriptionForm((f) => ({ ...f, minPriority: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Action</FieldLabel>
                <Input value={subscriptionForm.action} onChange={(e) => setSubscriptionForm((f) => ({ ...f, action: e.target.value }))} />
              </div>
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={mutating}
              onClick={() =>
                mutate({
                  intent: "upsertSubscription",
                  ...subscriptionForm,
                })
              }
            >
              Add subscription
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  function renderApps() {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Source Apps" value={data!.metrics.sourceApps} icon={Sparkles} />
          <StatCard label="Client Apps" value={data!.metrics.clientApps} icon={Smartphone} />
          <StatCard label="Installations" value={data!.metrics.installations} icon={Waves} />
          <StatCard label="Subscriptions" value={data!.metrics.subscriptions} icon={Settings2} />
        </div>

        <Panel>
          <SectionHeader title="Source Apps" description="Backend services that send notifications." />
          {data!.sourceApps.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No source apps.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>{""}</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.sourceApps.map((app) => (
                    <tr key={app.id}>
                      <TableCell className="font-mono text-[12px]">{app.id}</TableCell>
                      <TableCell>{app.displayName}</TableCell>
                      <TableCell>{app.description ?? "\u2014"}</TableCell>
                      <TableCell>{formatTimestamp(app.createdAt)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="xs" disabled={mutating} onClick={() => mutate({ intent: "rotateSourceToken", sourceAppId: app.id })}>
                          Rotate token
                        </Button>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-3 text-[13px] font-semibold text-foreground">Register source app</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel>ID</FieldLabel>
                <Input value={sourceAppForm.id} onChange={(e) => setSourceAppForm((f) => ({ ...f, id: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Display Name</FieldLabel>
                <Input value={sourceAppForm.displayName} onChange={(e) => setSourceAppForm((f) => ({ ...f, displayName: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <Input value={sourceAppForm.description} onChange={(e) => setSourceAppForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={mutating || !sourceAppForm.id || !sourceAppForm.displayName}
              onClick={() => mutate({ intent: "createSourceApp", ...sourceAppForm })}
            >
              Register
            </Button>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Client Apps" description="Mobile apps registered for push delivery." />
          {data!.clientApps.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No client apps.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Bundle</TableHead>
                    <TableHead>Created</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.clientApps.map((app) => (
                    <tr key={app.id}>
                      <TableCell className="font-mono text-[12px]">{app.id}</TableCell>
                      <TableCell>{app.displayName}</TableCell>
                      <TableCell><Badge variant="outline">{app.platform}</Badge></TableCell>
                      <TableCell className="font-mono text-[12px]">{app.bundleId}</TableCell>
                      <TableCell>{formatTimestamp(app.createdAt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-3 text-[13px] font-semibold text-foreground">Register client app</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>ID</FieldLabel>
                <Input value={clientAppForm.id} onChange={(e) => setClientAppForm((f) => ({ ...f, id: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Display Name</FieldLabel>
                <Input value={clientAppForm.displayName} onChange={(e) => setClientAppForm((f) => ({ ...f, displayName: e.target.value }))} />
              </div>
              <div>
                <FieldLabel>Platform</FieldLabel>
                <Input value={clientAppForm.platform} onChange={(e) => setClientAppForm((f) => ({ ...f, platform: e.target.value }))} placeholder="ios or android" />
              </div>
              <div>
                <FieldLabel>Bundle ID</FieldLabel>
                <Input value={clientAppForm.bundleId} onChange={(e) => setClientAppForm((f) => ({ ...f, bundleId: e.target.value }))} />
              </div>
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={mutating || !clientAppForm.id || !clientAppForm.displayName}
              onClick={() => mutate({ intent: "createClientApp", ...clientAppForm })}
            >
              Register
            </Button>
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Installations" description="Registered device installations." />
          {data!.installations.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No installations.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <TableHead>Device</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Client App</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>{""}</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.installations.map((inst) => (
                    <tr key={inst.id}>
                      <TableCell>{inst.deviceName}</TableCell>
                      <TableCell><Badge variant="outline">{inst.platform}</Badge></TableCell>
                      <TableCell className="font-mono text-[12px]">{inst.clientAppId}</TableCell>
                      <TableCell>{formatTimestamp(inst.lastSeenAt)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="xs" disabled={mutating} onClick={() => mutate({ intent: "unregisterInstallation", installationId: inst.id })}>
                          Unregister
                        </Button>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    );
  }

  function renderOperations() {
    return (
      <div className="space-y-6">
        <Panel>
          <SectionHeader title="All Notifications" description="Tenant-wide notification log." />
          {data!.notifications.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No notifications.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Created</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.notifications.map((n) => (
                    <tr key={n.id}>
                      <TableCell>{n.title ?? "(untitled)"}</TableCell>
                      <TableCell><PriorityBadge priority={n.priority} /></TableCell>
                      <TableCell><StateBadge state={n.status} /></TableCell>
                      <TableCell className="font-mono text-[12px]">{n.sourceAppId}</TableCell>
                      <TableCell>{n.context.agentId ?? "\u2014"}</TableCell>
                      <TableCell>{formatTimestamp(n.createdAt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeader title="All Deliveries" description="Individual push delivery attempts." />
          {data!.deliveries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No deliveries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <TableHead>ID</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Installation</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Read</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.deliveries.map((d) => (
                    <tr key={d.id}>
                      <TableCell className="font-mono text-[12px]">{d.id.slice(0, 8)}</TableCell>
                      <TableCell><StateBadge state={d.state} /></TableCell>
                      <TableCell>{d.provider}</TableCell>
                      <TableCell className="font-mono text-[12px]">{d.installationId.slice(0, 8)}</TableCell>
                      <TableCell>{formatTimestamp(d.createdAt)}</TableCell>
                      <TableCell>{formatTimestamp(d.readAt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeader title="Send Test Notification" description="Manually trigger a notification for testing." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Title</FieldLabel>
              <Input value={manualNotificationForm.title} onChange={(e) => setManualNotificationForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <Input value={manualNotificationForm.priority} onChange={(e) => setManualNotificationForm((f) => ({ ...f, priority: e.target.value }))} placeholder="normal, time-sensitive, critical" />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Body</FieldLabel>
              <Textarea value={manualNotificationForm.body} onChange={(e) => setManualNotificationForm((f) => ({ ...f, body: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Source App</FieldLabel>
              <Input value={manualNotificationForm.sourceAppId} onChange={(e) => setManualNotificationForm((f) => ({ ...f, sourceAppId: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Agent ID</FieldLabel>
              <Input value={manualNotificationForm.agentId} onChange={(e) => setManualNotificationForm((f) => ({ ...f, agentId: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Event Type</FieldLabel>
              <Input value={manualNotificationForm.eventType} onChange={(e) => setManualNotificationForm((f) => ({ ...f, eventType: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>Severity</FieldLabel>
              <Input value={manualNotificationForm.severity} onChange={(e) => setManualNotificationForm((f) => ({ ...f, severity: e.target.value }))} />
            </div>
          </div>
          <Button size="sm" className="mt-4" disabled={mutating} onClick={() => mutate({ intent: "sendDemoNotification", ...manualNotificationForm })}>
            <Send className="size-3.5" /> Send
          </Button>
        </Panel>
      </div>
    );
  }

  function renderGlances() {
    return (
      <Panel>
        <SectionHeader title="Glances" description="Live data surfaces pushed by source apps." />
        {data!.glances.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No glances.</p>
        ) : (
          <div className="space-y-3">
            {data!.glances.map((g) => (
              <div key={g.id} className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">{g.scope}</span>
                  <span className="text-[11px] text-muted-foreground">{g.sourceAppId}</span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[12px] text-foreground">
                  {JSON.stringify(g.data, null, 2)}
                </pre>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Updated {formatTimestamp(g.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    );
  }

  const sectionRenderers: Record<Section, () => React.ReactNode> = {
    inbox: renderInbox,
    preferences: renderPreferences,
    apps: renderApps,
    operations: renderOperations,
    glances: renderGlances,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notify</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Operational inbox and admin console for push notifications.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>Tenant: <span className="font-mono">{data.tenantId}</span></span>
          <span className="text-border">|</span>
          <span>User: <span className="font-mono">{data.userId}</span></span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              section === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Active section */}
      {sectionRenderers[section]()}
    </div>
  );
}
