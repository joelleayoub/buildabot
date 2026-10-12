"use client";
// Loads the Showroom in the browser only: it reads saved progress and renders WebGL.
import dynamic from "next/dynamic";

const Studio = dynamic(() => import("./Studio"), {
  ssr: false,
  loading: () => <div className="grid min-h-dvh place-items-center bg-white text-sm text-zinc-500">Loading buildabot…</div>,
});

export default function StudioClient() {
  return <Studio />;
}
