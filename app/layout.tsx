import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";
import FeedbackButton from "@/components/FeedbackButton";

export const metadata: Metadata = {
  title: "buildabot: build your first robot",
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
