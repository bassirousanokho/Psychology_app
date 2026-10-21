import type { Metadata } from "next";
// Bundled font files (no download from Google Fonts at build time)
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, frFR } from "@clerk/localizations";
import { headers } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "PsyApp",
  description: "Gestion de cabinet pour psychologues · Practice management for psychologists",
};

/**
 * Before sign-in the practice is unknown, so sign-in screens follow the browser's
 * preferred language (French unless it prefers English). Signed-in pages use the
 * practice's language setting (I18nProvider in the dashboard and portal layouts).
 */
async function browserLang(): Promise<"fr" | "en"> {
  const accept = (await headers()).get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "fr";
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await browserLang();
  return (
    <ClerkProvider localization={lang === "fr" ? frFR : enUS}>
      <html
        lang={lang}
        className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      >
        <body className="h-full bg-background text-foreground">
          <TooltipProvider delay={0}>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
