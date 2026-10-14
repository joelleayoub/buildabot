// Shared look for Open Graph preview images (the card shown when a link is pasted into a chat).
import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export function OgFrame({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#ffffff", padding: 64, fontFamily: "sans-serif", color: "#15171c" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#2a44f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 40, height: 30, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 9, height: 9, borderRadius: 9, background: "#2a44f5" }} />
            <div style={{ width: 9, height: 9, borderRadius: 9, background: "#2a44f5" }} />
          </div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1, display: "flex" }}>
          buildabot<span style={{ color: "#2a44f5" }}>.</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 30, color: "#2a44f5", fontWeight: 600 }}>{kicker}</div>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
        {children}
      </div>
      <div style={{ display: "flex", height: 16, borderRadius: 8, background: "#eceef1" }} />
    </div>
  );
}
