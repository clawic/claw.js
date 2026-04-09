"use client";

import { useEffect } from "react";
import { useDialog } from "@/context/DialogContext";

export default function NewCompanyPage() {
  const { openOnboarding } = useDialog();

  useEffect(() => {
    openOnboarding();
  }, [openOnboarding]);

  return null;
}
