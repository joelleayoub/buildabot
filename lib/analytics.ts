// Product analytics events, sent from the browser to /api/events (stored by lib/telemetry.ts).
// Each browser gets a random anonymous session id; no names, emails or locations are sent.
import type { AnalyticsEvent } from "./telemetry";

export type { AnalyticsEvent };

export function sessionId(): string {
  try {
    let id = localStorage.getItem("buildabot.session");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("buildabot.session", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function track(event: AnalyticsEvent, props: Record<string, string | number> = {}): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") console.debug("[analytics]", event, props);
  const body = JSON.stringify({ session: sessionId(), event, props, path: location.pathname });
  try {
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics must never break the app */
  }
}
