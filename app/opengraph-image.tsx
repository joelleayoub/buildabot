import { ImageResponse } from "next/og";
import { OG_SIZE, OgFrame } from "@/lib/og";

export const alt = "buildabot: build your first robot";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame kicker="Build your first robot" title="Answer a few questions. Get the parts, the wiring and the guide.">
        <div style={{ fontSize: 28, color: "#5d6472", display: "flex" }}>Every part checked to work together, with shops near you.</div>
      </OgFrame>
    ),
    size,
  );
}
