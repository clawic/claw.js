"use client";

import * as React from "react";

interface DialogContextValue {
  // New issue
  newIssueOpen: boolean;
  openNewIssue: () => void;
  closeNewIssue: () => void;
  // New agent (hire)
  newAgentOpen: boolean;
  openNewAgent: () => void;
  closeNewAgent: () => void;
  // Onboarding wizard
  onboardingOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  // Command palette (⌘K)
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [newIssueOpen, setNewIssueOpen] = React.useState(false);
  const [newAgentOpen, setNewAgentOpen] = React.useState(false);
  const [onboardingOpen, setOnboardingOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  const value = React.useMemo<DialogContextValue>(
    () => ({
      newIssueOpen,
      openNewIssue: () => setNewIssueOpen(true),
      closeNewIssue: () => setNewIssueOpen(false),
      newAgentOpen,
      openNewAgent: () => setNewAgentOpen(true),
      closeNewAgent: () => setNewAgentOpen(false),
      onboardingOpen,
      openOnboarding: () => setOnboardingOpen(true),
      closeOnboarding: () => setOnboardingOpen(false),
      commandPaletteOpen,
      openCommandPalette: () => setCommandPaletteOpen(true),
      closeCommandPalette: () => setCommandPaletteOpen(false),
      toggleCommandPalette: () => setCommandPaletteOpen((v) => !v),
    }),
    [newIssueOpen, newAgentOpen, onboardingOpen, commandPaletteOpen],
  );

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export function useDialog(): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}
