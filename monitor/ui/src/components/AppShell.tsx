import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMonitors, fetchSummary } from "../lib/api";
import { Sidebar } from "./Sidebar";
import type { MonitorSummary } from "../lib/types";

export function AppShell() {
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: fetchMonitors,
    refetchInterval: 30_000,
  });

  const { data: summary = null } = useQuery<MonitorSummary>({
    queryKey: ["summary"],
    queryFn: fetchSummary,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex h-full bg-bg">
      <Sidebar monitors={monitors} summary={summary} />
      <main className="flex-1 overflow-y-auto bg-bg">
        <Outlet />
      </main>
    </div>
  );
}
