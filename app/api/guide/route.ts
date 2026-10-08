import { jsonCatalog } from "@/lib/advisor/agent";
import type { ApiError, GuideResponse } from "@/lib/advisor/api";
import { advisorConfigured, describeAdvisorError, NOT_CONFIGURED } from "@/lib/advisor/errors";
import { generateGuide } from "@/lib/advisor/guide";
import { projectStore } from "@/lib/advisor/store";
import { isProjectId, parseItems, parseRequirements } from "@/lib/advisor/validate";
import { checkBuild } from "@/lib/compat/checkBuild";

export const maxDuration = 300;

const bad = (message: string) => Response.json({ error: "bad_request", message } satisfies ApiError, { status: 400 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const items = parseItems(body?.items)?.map(({ part_id, quantity, reason }) => ({ part_id, quantity, reason }));
  const requirements = parseRequirements(body?.requirements);
  if (!isProjectId(body?.projectId)) return bad("Missing project id.");
  if (!items || items.length === 0) return bad("The build is empty.");
  if (!requirements) return bad("Missing requirements.");

  // The checker is the source of truth: never write a guide for a build with errors.
  const byId = Object.fromEntries((await jsonCatalog.parts()).map((p) => [p.id, p]));
  const report = checkBuild(items, byId, requirements);
  if (!report.ok) return bad("Fix the compatibility errors in the build before generating a guide.");

  if (!advisorConfigured()) return Response.json(NOT_CONFIGURED, { status: 503 });

  try {
    const markdown = await generateGuide(items, byId, requirements, report);
    await projectStore().save(body.projectId, { items, requirements, report, guide: markdown });
    return Response.json({ markdown } satisfies GuideResponse);
  } catch (err) {
    console.error("guide generation failed", err);
    const { status, body } = describeAdvisorError(err);
    return Response.json(body, { status });
  }
}
