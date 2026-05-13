"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompanyProvider } from "@/context/CompanyContext";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { DialogProvider } from "@/context/DialogContext";
import { PropertiesPanelProvider } from "./PropertiesPanel";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        <SidebarProvider>
          <CompanyProvider>
            <BreadcrumbProvider>
              <PropertiesPanelProvider>
                <DialogProvider>{children}</DialogProvider>
              </PropertiesPanelProvider>
            </BreadcrumbProvider>
          </CompanyProvider>
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
