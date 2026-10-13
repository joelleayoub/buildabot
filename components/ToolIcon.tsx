// Line icons for supplies and tools (24 x 24, stroke = currentColor).
import type { ReactNode } from "react";
import type { ExtraIcon } from "@/lib/extras";

const PATHS: Record<ExtraIcon, ReactNode> = {
  screwdriver: <path d="M14 3l7 7-3 3-7-7zM11 6l-7 11 3 3 11-7" />,
  multimeter: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <rect x="8.5" y="5" width="7" height="4" rx="0.5" />
      <circle cx="12" cy="15" r="2.5" />
    </>
  ),
  wires: <path d="M3 7c6 0 6 10 12 10h6M3 17c6 0 6-10 12-10h6" />,
  ties: <path d="M4 12a8 8 0 1 0 8-8M12 4h8v3h-8" />,
  solder: <path d="M3 21l6-6M9 15l8-8 3 3-8 8zM17 7l3-3" />,
  charger: (
    <>
      <rect x="4" y="6" width="14" height="12" rx="2" />
      <path d="M18 10h2v4h-2M11 8l-2 4h4l-2 4" />
    </>
  ),
  fuse: (
    <>
      <rect x="6" y="9" width="12" height="6" rx="1" />
      <path d="M2 12h4M18 12h4M9 12h6" />
    </>
  ),
  screws: (
    <>
      <path d="M8 3h8l-1 3H9z" />
      <path d="M12 6v15M9 9l6 2M9 13l6 2M9 17l6 2" />
    </>
  ),
  card: (
    <>
      <path d="M7 2h7l4 4v16H7z" />
      <path d="M10 2v4M13 2v4" />
    </>
  ),
  usb: (
    <>
      <rect x="8" y="2" width="8" height="7" rx="1" />
      <path d="M12 9v6M8 15h8v3a4 4 0 0 1-8 0z" />
    </>
  ),
  fan: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 10c0-3 1-5 3-5M14 12c3 0 5 1 5 3M12 14c0 3-1 5-3 5M10 12c-3 0-5-1-5-3" />
    </>
  ),
  resistor: <path d="M2 12h4l1.5-3 3 6 3-6 3 6 1.5-3h4" />,
  board: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h.01M10 9h.01M13 9h.01M16 9h.01M7 15h.01M10 15h.01M13 15h.01M16 15h.01M3 12h18" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" />,
  pliers: <path d="M4 4l6 6M10 4L4 10M7 7l3 3 4 4c1 1 1 3 3 5M10 10l4 4c1 1 3 1 5 3" />,
  hex: <path d="M6 3l12 0M18 3v4M18 7l-12 12M6 19l-2 2" />,
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
};

export function ToolIcon({ icon, className = "h-6 w-6" }: { icon: ExtraIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[icon]}
    </svg>
  );
}
