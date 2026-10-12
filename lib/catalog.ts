// Static catalog bundled with the app. Swap for Supabase queries once the DB is live.
import partsJson from "@/data/parts.json";
import designsJson from "@/data/reference_designs.json";
import type { Part, Slot } from "./compat/types";
import type { ReferenceDesign } from "./advisor/tools";

export const PARTS = partsJson as unknown as Part[];
export const DESIGNS = designsJson as unknown as ReferenceDesign[];
export const PARTS_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const partsInSlot = (slot: Slot) => PARTS.filter((p) => p.slot === slot);

/** Human retailer name from a buy URL, for "Find at …" links. */
export function retailerName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const known: Record<string, string> = {
    "aliexpress.com": "AliExpress",
    "pololu.com": "Pololu",
    "adafruit.com": "Adafruit",
    "sparkfun.com": "SparkFun",
    "cytron.io": "Cytron",
    "store.arduino.cc": "Arduino Store",
    "raspberrypi.com": "Raspberry Pi",
    "pjrc.com": "PJRC",
    "nvidia.com": "NVIDIA",
    "slamtec.com": "Slamtec",
    "shop.luxonis.com": "Luxonis",
    "intelrealsense.com": "Intel RealSense",
    "digikey.com": "DigiKey",
  };
  return known[host] ?? host;
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
