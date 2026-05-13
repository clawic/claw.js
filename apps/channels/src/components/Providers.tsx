"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HubProvider } from "@/context/HubContext";
import { RealtimeProvider } from "@/context/RealtimeContext";

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
        <HubProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </HubProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
