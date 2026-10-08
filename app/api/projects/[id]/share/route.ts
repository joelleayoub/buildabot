import type { ApiError, ShareResponse } from "@/lib/advisor/api";
import { projectStore } from "@/lib/advisor/store";
import { isProjectId } from "@/lib/advisor/validate";

const error = (status: number, error: string, message: string) => Response.json({ error, message } satisfies ApiError, { status });

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isProjectId(id)) return error(400, "bad_request", "Invalid project id.");
  try {
    const slug = await projectStore().share(id);
    if (!slug) return error(404, "not_found", "Save a build before sharing it.");
    return Response.json({ slug } satisfies ShareResponse);
  } catch (err) {
    console.error("share project failed", err);
    return error(500, "internal", "Couldn't create a share link.");
  }
}
