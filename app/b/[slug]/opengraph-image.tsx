import { ImageResponse } from "next/og";
import { projectStore } from "@/lib/advisor/store";
import { PARTS_BY_ID } from "@/lib/catalog";
import { checkBuild } from "@/lib/compat/checkBuild";
import { AUTONOMY_LABELS, SLOT_LABELS } from "@/lib/slots";
import { OG_SIZE, OgFrame } from "@/lib/og";

export const alt = "A robot build on buildabot";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = /^[\w-]{6,40}$/.test(slug) ? await projectStore().loadShared(slug).catch(() => null) : null;
  if (!shared || shared.items.length === 0) {
    return new ImageResponse(<OgFrame kicker="A robot build" title="Open it on buildabot" />, size);
  }
  const report = checkBuild(shared.items, PARTS_BY_ID, shared.requirements ?? undefined);
  const parts = shared.items.map((i) => PARTS_BY_ID[i.part_id]).filter(Boolean);
  const goal = shared.requirements ? AUTONOMY_LABELS[shared.requirements.autonomy] : "A rover";
  return new ImageResponse(
    (
      <OgFrame kicker={`${parts.length} parts · about $${Math.round(report.totals.price_usd_approx)}`} title={goal}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 1080 }}>
          {parts.slice(0, 10).map((p) => (
            <div key={p.id} style={{ fontSize: 24, padding: "8px 18px", borderRadius: 999, background: "#eef1ff", color: "#1d33c9", display: "flex" }}>
              {SLOT_LABELS[p.slot]}
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    size,
  );
}
