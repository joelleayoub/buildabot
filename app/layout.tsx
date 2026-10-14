import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";
import FeedbackButton from "@/components/FeedbackButton";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "buildabot: build your first robot",
  openGraph: { title: "buildabot: build your first robot", description: "Answer a few questions, get a compatible parts list, a wiring diagram and a step-by-step build guide.", siteName: "buildabot", type: "website" },
  twitter: { card: "summary_large_image" },
  description: "Answer a few questions, get a compatible parts list, a wiring diagram and a step-by-step build guide.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <Suspense fallback={null}>
          <FeedbackButton />
        </Suspense>
      </body>
    </html>
  );
}
