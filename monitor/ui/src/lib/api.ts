import type { LocalInstance, LocalInstanceDetail, MonitorDetail, MonitorEntry, MonitorModeSnapshot, MonitorSummary } from "./types";

const BASE = "";

async function json<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fetchSummary(): Promise<MonitorSummary> {
  return json("/api/summary");
}

export function fetchMonitors(): Promise<MonitorEntry[]> {
  return json("/api/monitors");
}

export function fetchMonitor(id: string): Promise<MonitorDetail> {
  return json(`/api/monitors/${encodeURIComponent(id)}`);
}

export function runSetup(): Promise<{ created: number; monitors: string[] }> {
  return post("/api/setup");
}

export function fetchConfig(): Promise<MonitorModeSnapshot> {
  return json("/api/config");
}

export function fetchInstances(): Promise<LocalInstance[]> {
  return json("/api/instances");
}

export function fetchInstance(id: string): Promise<LocalInstanceDetail> {
  return json(`/api/instances/${encodeURIComponent(id)}`);
}

export function runLocalDiscover(): Promise<{ created: number; monitors: string[] }> {
  return post("/api/discover/local");
}
