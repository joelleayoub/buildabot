// Feedback from the in-app button. Stored in Supabase `feedback`, or in memory without a database.
import { memory, parseFeedback, recordFeedback } from "@/lib/telemetry";

export async function POST(req: Request) {
  const row = parseFeedback(await req.json().catch(() => null));
  if (!row) return Response.json({ error: "bad_request", message: "Write a message or pick a rating." }, { status: 400 });
  try {
    await recordFeedback(row);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("feedback failed", err);
    return Response.json({ error: "internal", message: "Couldn't send your feedback. Please try again." }, { status: 500 });
  }
}

/** Local runs without a database: read back what testers sent. With Supabase, use its table editor. */
export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SUPABASE_URL) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ feedback: memory.feedback, events: memory.events.slice(-500) });
}
