// Request/response shapes shared by the API routes and the client.

import type { BuildItem, Requirements } from "../compat/types";
import type { TranscriptMessage } from "./transcript";
import type { ReferenceDesign } from "./tools";

export interface ChatRequest {
  projectId: string;
  message: string;
  /** Current cart, so the advisor hears about parts the user swapped in the UI. */
  items: BuildItem[];
  requirements: Requirements | null;
}

export interface ChatResponse {
  text: string;
  /** Set only when the advisor presented a new build this turn. */
  build: { items: BuildItem[]; summary: string } | null;
  requirements: Requirements | null;
  designs: ReferenceDesign[];
}

export interface GuideRequest {
  projectId: string;
  items: BuildItem[];
  requirements: Requirements;
}

export interface GuideResponse {
  markdown: string;
}

/** PUT /api/projects/[id] */
export interface SaveProjectRequest {
  items: BuildItem[];
  requirements: Requirements | null;
}

/** GET /api/projects/[id] */
export interface ProjectResponse {
  items: BuildItem[];
  requirements: Requirements | null;
  messages: TranscriptMessage[];
  guide: string | null;
  shareSlug: string | null;
}

/** POST /api/projects/[id]/share */
export interface ShareResponse {
  slug: string;
}

export interface ApiError {
  /** `advisor_not_configured` when no Anthropic API key is set. */
  error: string;
  message: string;
}

export function sameItems(a: BuildItem[], b: BuildItem[]): boolean {
  const key = (items: BuildItem[]) =>
    items
      .map((i) => `${i.part_id}x${i.quantity}`)
      .sort()
      .join("|");
  return key(a) === key(b);
}
