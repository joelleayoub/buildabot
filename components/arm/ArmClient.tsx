"use client";
// The arm advisor reads saved progress from this browser, so it renders client-only.
import dynamic from "next/dynamic";

const ArmAdvisor = dynamic(() => import("./ArmAdvisor"), {
  ssr: false,
  loading: () => <div className="grid min-h-dvh place-items-center bg-white text-sm text-zinc-500">Loading the arm advisor…</div>,
});

export default function ArmClient() {
  return <ArmAdvisor />;
}
