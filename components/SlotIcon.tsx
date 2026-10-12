import type { ReactNode } from "react";
import type { Slot } from "@/lib/compat/types";
import { groupColor, SLOT_GROUP } from "@/lib/slots";

// 24x24 line icons, one per slot.
const PATHS: Record<Slot, ReactNode> = {
  chassis: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="7" cy="9" r="0.8" />
      <circle cx="17" cy="9" r="0.8" />
      <circle cx="7" cy="15" r="0.8" />
      <circle cx="17" cy="15" r="0.8" />
    </>
  ),
  drive_motor: (
    <>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10h3v4h-3M18 12h3M7 7v10M11 7v10" />
    </>
  ),
  wheels: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    </>
  ),
  caster: (
    <>
      <path d="M5 5h14M12 5v4M7 13a5 5 0 0 1 10 0" />
      <circle cx="12" cy="16" r="4" />
    </>
  ),
  motor_driver: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3M10 10l4 4M14 10l-4 4" />
    </>
  ),
  controller: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <rect x="10" y="10" width="5" height="4" />
      <path d="M6 6V4M9 6V4M12 6V4M15 6V4M18 6V4M6 20v-2M9 20v-2M12 20v-2M15 20v-2M18 20v-2" />
    </>
  ),
  compute: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 5V2M15 5V2M9 22v-3M15 22v-3M5 9H2M5 15H2M22 9h-3M22 15h-3" />
    </>
  ),
  battery: (
    <>
      <rect x="2" y="7" width="17" height="10" rx="2" />
      <path d="M22 10.5v3M11.5 9l-3 3.2h4l-3 2.8" />
    </>
  ),
  regulator: (
    <>
      <path d="M3 6h7v12h8" />
      <path d="M15 15l3 3-3 3" />
      <path d="M3 3v6" />
    </>
  ),
  lidar: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  imu: (
    <>
      <path d="M12 13V3M12 3l-2.5 2.5M12 3l2.5 2.5M12 13l8 5M20 18l-3.4-.3M20 18l-1.3-3.1M12 13l-8 5M4 18l3.4-.3M4 18l1.3-3.1" />
    </>
  ),
  distance_sensor: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <circle cx="8" cy="12" r="2.5" />
      <circle cx="16" cy="12" r="2.5" />
    </>
  ),
};

export function SlotIcon({ slot, className = "h-5 w-5" }: { slot: Slot; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[slot]}
    </svg>
  );
}

/** Slot icon on a tile tinted with its part family's colour. */
export function SlotBadge({ slot, size = "md" }: { slot: Slot; size?: "sm" | "md" | "lg" }) {
  const color = groupColor(SLOT_GROUP[slot]);
  const box = { sm: "h-7 w-7 rounded-md", md: "h-9 w-9 rounded-lg", lg: "h-11 w-11 rounded-xl" }[size];
  const icon = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" }[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box}`} style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <SlotIcon slot={slot} className={icon} />
    </span>
  );
}
