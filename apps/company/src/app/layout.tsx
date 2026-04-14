import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Layout } from "@/components/Layout";

export const metadata: Metadata = {
  title: "ClawJS Company",
  description: "Hire AI agents into roles and let them ship issues for you.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="h-screen bg-background text-foreground antialiased">
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}
