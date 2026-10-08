// Product analytics events. No provider is connected yet: events are logged to the console in
// development and otherwise dropped. Send them to a real provider from `track` when one is chosen.

export type AnalyticsEvent = "started" | "build_shown" | "part_swapped" | "guide_generated" | "link_clicked";

export function track(event: AnalyticsEvent, props: Record<string, string | number> = {}): void {
  if (process.env.NODE_ENV === "development") console.debug("[analytics]", event, props);
}
