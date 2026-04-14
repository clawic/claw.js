"use client";

import * as React from "react";
import { useHub } from "@/context/HubContext";

export default function SettingsPage() {
  const { currentAgentId } = useHub();

  return (
    <div className="flex flex-1 flex-col p-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="mt-6 max-w-lg space-y-4">
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Current Identity
          </h3>
          <p className="mt-1 text-sm">{currentAgentId}</p>
        </div>
      </div>
    </div>
  );
}
