// Project persistence. Server-only: uses the Supabase service-role key, which bypasses row level
// security, so never import this from a client component. There is no login yet — knowing a
// project's (random) id is what grants access to it. Falls back to memory when Supabase isn't
// configured, so local dev works without a database.

import type Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { BuildItem, BuildReport, Requirements } from "../compat/types";

export interface ProjectState {
  history: Anthropic.MessageParam[];
  requirements: Requirements | null;
  items: BuildItem[];
  guide: string | null;
  shareSlug: string | null;
}

export interface SharedBuild {
  items: BuildItem[];
  requirements: Requirements | null;
  guide: string | null;
}

export interface CartPatch {
  items: BuildItem[];
  requirements: Requirements | null;
  report: BuildReport;
  /** `undefined` leaves the stored guide alone; `null` clears it. */
  guide?: string | null;
}

export interface ProjectStore {
  load(id: string): Promise<ProjectState | null>;
  /** Creates the project if needed, updates the cart, and appends any new chat messages. */
  save(id: string, patch: CartPatch, newMessages?: Anthropic.MessageParam[]): Promise<void>;
  /** Returns the share slug, creating one on first call. `null` if the project doesn't exist. */
  share(id: string): Promise<string | null>;
  loadShared(slug: string): Promise<SharedBuild | null>;
}

const newSlug = () => randomBytes(9).toString("base64url");

const hasRequirements = (r: unknown): r is Requirements => typeof (r as Requirements | null)?.autonomy === "string";

function supabaseStore(db: SupabaseClient): ProjectStore {
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  return {
    async load(id) {
      const { data: p, error } = await db.from("projects").select("requirements, build, guide_md, share_slug").eq("id", id).maybeSingle();
      fail("load project", error);
      if (!p) return null;
      const { data: rows, error: e2 } = await db.from("messages").select("role, content").eq("project_id", id).order("id");
      fail("load messages", e2);
      return {
        history: (rows ?? []) as Anthropic.MessageParam[],
        requirements: hasRequirements(p.requirements) ? p.requirements : null,
        items: p.build ?? [],
        guide: p.guide_md,
        shareSlug: p.share_slug,
      };
    },
    async save(id, patch, newMessages = []) {
      const row = {
        id,
        requirements: patch.requirements ?? {},
        build: patch.items,
        last_report: patch.report,
        updated_at: new Date().toISOString(),
        ...(patch.guide !== undefined ? { guide_md: patch.guide } : {}),
      };
      fail("save project", (await db.from("projects").upsert(row)).error);
      if (newMessages.length) {
        const rows = newMessages.map((m) => ({ project_id: id, role: m.role, content: m.content }));
        fail("save messages", (await db.from("messages").insert(rows)).error);
      }
    },
    async share(id) {
      const { data: p, error } = await db.from("projects").select("share_slug").eq("id", id).maybeSingle();
      fail("load project", error);
      if (!p) return null;
      if (p.share_slug) return p.share_slug;
      const slug = newSlug();
      fail("share project", (await db.from("projects").update({ share_slug: slug }).eq("id", id)).error);
      return slug;
    },
    async loadShared(slug) {
      const { data: p, error } = await db.from("projects").select("requirements, build, guide_md").eq("share_slug", slug).maybeSingle();
      fail("load shared project", error);
      if (!p) return null;
      return { items: p.build ?? [], requirements: hasRequirements(p.requirements) ? p.requirements : null, guide: p.guide_md };
    },
  };
}

function memoryStore(): ProjectStore {
  const MAX_PROJECTS = 200;
  // Survives Next.js hot reloads in dev.
  const g = globalThis as typeof globalThis & { __buildabotProjects?: Map<string, ProjectState> };
  const projects = (g.__buildabotProjects ??= new Map());
  return {
    async load(id) {
      const p = projects.get(id);
      return p ? structuredClone(p) : null;
    },
    async save(id, patch, newMessages = []) {
      if (!projects.has(id) && projects.size >= MAX_PROJECTS) projects.delete(projects.keys().next().value as string);
      const p = projects.get(id) ?? { history: [], requirements: null, items: [], guide: null, shareSlug: null };
      projects.set(id, {
        ...p,
        history: [...p.history, ...newMessages],
        requirements: patch.requirements,
        items: patch.items,
        guide: patch.guide !== undefined ? patch.guide : p.guide,
      });
    },
    async share(id) {
      const p = projects.get(id);
      if (!p) return null;
      return (p.shareSlug ??= newSlug());
    },
    async loadShared(slug) {
      const p = [...projects.values()].find((x) => x.shareSlug === slug);
      return p ? { items: p.items, requirements: p.requirements, guide: p.guide } : null;
    },
  };
}

let store: ProjectStore | undefined;

export function projectStore(): ProjectStore {
  if (store) return store;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  store = url && key ? supabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })) : memoryStore();
  return store;
}
