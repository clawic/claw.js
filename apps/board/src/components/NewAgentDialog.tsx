"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { invalidateCompanyQueries, useCompanyDetailQuery } from "@/lib/board-queries";
import type { CompanyAgent } from "@/lib/company-types";

const COMMON_ROLES = [
  { role: "cto", title: "Chief Technology Officer", icon: "cpu" },
  { role: "coo", title: "Chief Operating Officer", icon: "briefcase" },
  { role: "cfo", title: "Chief Financial Officer", icon: "dollar-sign" },
  { role: "cmo", title: "Chief Marketing Officer", icon: "megaphone" },
  { role: "pm", title: "Product Manager", icon: "target" },
  { role: "swe", title: "Senior Engineer", icon: "code" },
  { role: "designer", title: "Senior Designer", icon: "palette" },
  { role: "researcher", title: "Research Lead", icon: "flask-conical" },
];

export function NewAgentDialog() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { newAgentOpen, closeNewAgent } = useDialog();

  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [capabilities, setCapabilities] = React.useState("");
  const [reportsTo, setReportsTo] = React.useState("");

  const { data } = useCompanyDetailQuery(selectedCompanyId, { enabled: newAgentOpen });

  const hire = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/companies/${selectedCompanyId}/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          title,
          capabilities: capabilities || undefined,
          reportsTo: reportsTo || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `hire failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      void invalidateCompanyQueries(queryClient, selectedCompanyId);
      setName("");
      setRole("");
      setTitle("");
      setCapabilities("");
      setReportsTo("");
      closeNewAgent();
    },
  });

  const applyPreset = (preset: (typeof COMMON_ROLES)[number]) => {
    setRole(preset.role);
    setTitle(preset.title);
  };

  return (
    <Dialog open={newAgentOpen} onOpenChange={(open) => !open && closeNewAgent()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Hire a new agent
          </DialogTitle>
          <DialogDescription>
            Define the role, title and responsibilities. On hire, a ClawJS agent is spun up with a
            generated AGENTS.md system prompt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Quick presets
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_ROLES.map((preset) => (
                <button
                  key={preset.role}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <Input
                placeholder="e.g. Ada"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Role key
              </Label>
              <Input
                placeholder="e.g. cto"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Title
            </Label>
            <Input
              placeholder="e.g. Chief Technology Officer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Capabilities
            </Label>
            <Textarea
              rows={4}
              placeholder="What is this agent responsible for?"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Reports to
            </Label>
            <Select value={reportsTo || "board"} onValueChange={(v) => setReportsTo(v === "board" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Board (you)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="board">Board (you)</SelectItem>
                {(data?.agents ?? [])
                  .filter((a) => a.status === "active")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {hire.error && (
            <p className="text-xs text-red-500">
              {hire.error instanceof Error ? hire.error.message : String(hire.error)}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={closeNewAgent}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !role.trim() || !title.trim() || hire.isPending}
            onClick={() => hire.mutate()}
          >
            {hire.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-3 w-3" /> Hire
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
