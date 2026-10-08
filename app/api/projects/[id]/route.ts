import { jsonCatalog } from "@/lib/advisor/agent";
import type { ApiError, ProjectResponse } from "@/lib/advisor/api";
import { projectStore } from "@/lib/advisor/store";
import { transcript } from "@/lib/advisor/transcript";
import { isProjectId, parseItems, parseRequirements } from "@/lib/advisor/validate";
import { checkBuild } from "@/lib/compat/checkBuild";

type Ctx = { params: Promise<{ id: string }> };

const error = (status: number, error: string, message: string) => Response.json({ error, message } satisfies ApiError, { status });

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isProjectId(id)) return error(400, "bad_request", "Invalid project id.");
  try {
    const p = await projectStore().load(id);
    if (!p) return error(404, "not_found", "Project not found.");
    return Response.json({
      items: p.items,
      requirements: p.requirements,
      messages: transcript(p.history),
      guide: p.guide,
      shareSlug: p.shareSlug,
    } satisfies ProjectResponse);
  } catch (err) {
    console.error("load project failed", err);
    return error(500, "internal", "Couldn't load your saved build.");
  }
}

/** Saves the cart after the user edits it by hand. Clears any guide written for the old cart. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const items = parseItems(body?.items);
  if (!isProjectId(id) || !items) return error(400, "bad_request", "Invalid build.");
  const requirements = parseRequirements(body?.requirements);
  try {
    const byId = Object.fromEntries((await jsonCatalog.parts()).map((p) => [p.id, p]));
    const report = checkBuild(items, byId, requirements ?? undefined);
    await projectStore().save(id, { items, requirements, report, guide: null });
    return Response.json({ saved: true });
  } catch (err) {
    console.error("save project failed", err);
    return error(500, "internal", "Couldn't save your build.");
  }
}
