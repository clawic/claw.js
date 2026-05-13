"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import type { CompanyAgent, Issue, IssuePriority } from "@/lib/company-types";

export function NewIssueDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { newIssueOpen, closeNewIssue } = useDialog();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<IssuePriority>("medium");
  const [assigneeId, setAssigneeId] = React.useState<string>("");

  const { data: company } = useQuery({
    queryKey: ["company-detail", selectedCompanyId],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${selectedCompanyId}`);
      if (!res.ok) throw new Error("load failed");
      return (await res.json()) as { agents: CompanyAgent[] };
    },
    enabled: !!selectedCompanyId && newIssueOpen,
  });

  const create = useMutation({
    mutationFn: async (): Promise<{ issue: Issue }> => {
      const res = await fetch(`/api/companies/${selectedCompanyId}/issues`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          priority,
          assigneeAgentId: assigneeId || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `create failed: ${res.status}`);
      }
      return (await res.json()) as { issue: Issue };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["company-detail"] });
      queryClient.invalidateQueries({ queryKey: ["company-sidebar"] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setTitle("");
      setDescription("");
      setPriority("medium");
      setAssigneeId("");
      closeNewIssue();
      router.push(`/${selectedCompanyId}/issues/${data.issue.id}`);
    },
  });

  return (
    <Dialog open={newIssueOpen} onOpenChange={(open) => !open && closeNewIssue()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SquarePen className="h-4 w-4" /> New issue
          </DialogTitle>
          <DialogDescription>
            Describe the work, pick an assignee, and hit Create.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Description (markdown ok)"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <Select value={priority} onValueChange={(v) => setPriority(v as IssuePriority)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assigneeId || "unassigned"} onValueChange={(v) => setAssigneeId(v === "unassigned" ? "" : v)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(company?.agents ?? [])
                  .filter((a) => a.status === "active")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title} · {a.adapterType === "human" ? "you" : "agent"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {create.error && (
            <p className="text-xs text-red-500">
              {create.error instanceof Error ? create.error.message : String(create.error)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeNewIssue}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
