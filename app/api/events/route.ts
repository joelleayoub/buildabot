// Analytics events from the browser (lib/analytics.ts). Fire and forget: always answers 204.
import { parseEvent, recordEvent } from "@/lib/telemetry";

export async function POST(req: Request) {
  const row = parseEvent(await req.json().catch(() => null));
  if (row) await recordEvent(row).catch((err) => console.error("event failed", err));
  return new Response(null, { status: 204 });
}
