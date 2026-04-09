"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Building2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";
import { cn } from "@/lib/utils";

interface Step {
  title: string;
  subtitle: string;
}

const STEPS: Step[] = [
  { title: "Welcome aboard", subtitle: "ClawJS Company lets you hire AI agents into roles and delegate real work." },
  { title: "Create your company", subtitle: "A company is a workspace with its own issue prefix (e.g. ACM-1)." },
  { title: "You're the board", subtitle: "A CEO (you) plus a starter goal, project, and first issue are created for you." },
];

export function OnboardingWizard() {
  const queryClient = useQueryClient();
  const { onboardingOpen, closeOnboarding } = useDialog();
  const { setSelectedCompanyId } = useCompany();

  const [step, setStep] = React.useState(0);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      return res.json() as Promise<{ company: { id: string } }>;
    },
    onSuccess: (data) => {
      setSelectedCompanyId(data.company.id);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-sidebar"] });
      queryClient.invalidateQueries({ queryKey: ["company-detail"] });
      setStep(2);
    },
  });

  const finish = () => {
    setStep(0);
    setName("");
    setDescription("");
    closeOnboarding();
  };

  return (
    <Dialog open={onboardingOpen} onOpenChange={(open) => !open && finish()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 0 ? (
              <Sparkles className="h-4 w-4" />
            ) : step === 1 ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4 text-green-500" />
            )}
            {STEPS[step].title}
          </DialogTitle>
          <DialogDescription>{STEPS[step].subtitle}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5 py-2">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                idx <= step ? "bg-foreground" : "bg-muted",
              )}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Here is how it works:
            </p>
            <ol className="list-inside list-decimal space-y-1.5 text-[13px]">
              <li>Create a company with a name and issue prefix.</li>
              <li>Hire agents into roles (CTO, Engineer, Designer, etc.).</li>
              <li>Open issues and let the agents ship real, streamed responses.</li>
            </ol>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Company name
              </Label>
              <Input
                autoFocus
                placeholder="Acme Robotics"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Description (optional)
              </Label>
              <Textarea
                rows={3}
                placeholder="What does this company do?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {create.error && (
              <p className="text-xs text-red-500">
                {create.error instanceof Error ? create.error.message : String(create.error)}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium text-foreground">Your company is ready.</p>
            <ul className="space-y-1 text-[12px] text-muted-foreground">
              <li>· Starter goal, project and CEO created.</li>
              <li>· First issue assigned to you, describing next steps.</li>
              <li>· Head to the Agents tab to hire your first engineer.</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          {step === 0 && (
            <Button onClick={() => setStep(1)}>Get started</Button>
          )}
          {step === 1 && (
            <>
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Create company
              </Button>
            </>
          )}
          {step === 2 && <Button onClick={finish}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
