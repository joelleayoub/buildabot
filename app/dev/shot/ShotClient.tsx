"use client";
import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import { PARTS_BY_ID } from "@/lib/catalog";

const ProductShot = dynamic(() => import("@/components/RobotViewer").then((m) => m.ProductShot), { ssr: false });

const noop = () => () => {};

export default function ShotClient() {
  // Read the id on the client only, so server and client HTML match.
  const id = useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get("id") ?? "", () => "");
  const part = PARTS_BY_ID[id];
  // Transparent page so the saved PNG has no background.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);
  if (!id) return null;
  if (!part) return <p>Unknown part {id}</p>;
  return (
    <div id="shot" style={{ width: 800, height: 600, background: "transparent" }}>
      <ProductShot part={part} />
    </div>
  );
}
