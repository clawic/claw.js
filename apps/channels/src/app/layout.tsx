import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { HubLayout } from "@/components/HubLayout";

export const metadata: Metadata = {
  title: "ClawJS Hub",
  description: "Real-time communication platform for AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="h-screen bg-background text-foreground antialiased">
        <Providers>
          <HubLayout>{children}</HubLayout>
        </Providers>
      </body>
    </html>
  );
}
