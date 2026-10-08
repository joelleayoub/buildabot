import { advisorTurn, jsonCatalog } from "@/lib/advisor/agent";
import { sameItems, type ApiError, type ChatResponse } from "@/lib/advisor/api";
import { advisorConfigured, describeAdvisorError, NOT_CONFIGURED } from "@/lib/advisor/errors";
import { projectStore } from "@/lib/advisor/store";
import type { AdvisorSession } from "@/lib/advisor/tools";
import { advisorKnownItems, cartNote, designsShown } from "@/lib/advisor/transcript";
import { isProjectId, parseItems, parseRequirements } from "@/lib/advisor/validate";
import { checkBuild } from "@/lib/compat/checkBuild";
import type { BuildItem, BuildReport, Requirements } from "@/lib/compat/types";

export const maxDuration = 120;

const MAX_MESSAGE_CHARS = 4000;

const bad = (message: string) => Response.json({ error: "bad_request", message } satisfies ApiError, { status: 400 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const projectId = body?.projectId;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const items = parseItems(body?.items ?? []);
  if (!isProjectId(projectId)) return bad("Missing project id.");
  if (!message) return bad("Message is empty.");
  if (message.length > MAX_MESSAGE_CHARS) return bad(`Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
  if (!items) return bad("Invalid cart.");

  if (!advisorConfigured()) return Response.json(NOT_CONFIGURED, { status: 503 });

  try {
    const store = projectStore();
    const project = await store.load(projectId);
    const history = project?.history ?? [];
    const turnStart = history.length;
    let requirements: Requirements | null = project?.requirements ?? parseRequirements(body?.requirements);

    // Tell the advisor about parts the user swapped in the cart since its last turn.
    const edited = !sameItems(items, advisorKnownItems(history));
    history.push({ role: "user", content: (edited ? cartNote(items) : "") + message });

    let presented: { items: BuildItem[]; summary: string; report: BuildReport } | null = null;
    const session: AdvisorSession = {
      async saveRequirements(r) {
        requirements = r;
      },
      async presentBuild(build) {
        presented = build;
      },
    };

    const text = await advisorTurn(history, jsonCatalog, session);
    const built = presented as { items: BuildItem[]; summary: string; report: BuildReport } | null;
    const added = history.slice(turnStart);

    // Nothing is written until the whole turn succeeded, so a failed turn leaves the stored history valid.
    const cart = built?.items ?? items;
    const byId = Object.fromEntries((await jsonCatalog.parts()).map((p) => [p.id, p]));
    const report = built?.report ?? checkBuild(cart, byId, requirements ?? undefined);
    await store.save(projectId, { items: cart, requirements, report, ...(built || edited ? { guide: null } : {}) }, added);

    return Response.json({
      text,
      build: built ? { items: built.items, summary: built.summary } : null,
      requirements,
      designs: designsShown(added),
    } satisfies ChatResponse);
  } catch (err) {
    console.error("advisor turn failed", err);
    const { status, body } = describeAdvisorError(err);
    return Response.json(body, { status });
  }
}
