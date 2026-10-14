"use client";
// Download button for a designed part's STL, for pages outside the studio (shared builds).
import type { PartDesign } from "@/lib/cad/spec";

export function StlButton({ design }: { design: PartDesign }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const { buildPart, toSTL } = await import("@/lib/cad/geometry");
        const url = URL.createObjectURL(new Blob([toSTL(buildPart(design))], { type: "model/stl" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "part"}.stl`;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="text-xs font-semibold underline underline-offset-2"
    >
      Download STL
    </button>
  );
}
