"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiError, ChatRequest, ChatResponse, GuideRequest, GuideResponse, ProjectResponse, SaveProjectRequest, ShareResponse } from "@/lib/advisor/api";
import type { BuildItem, Part, Requirements } from "@/lib/compat/types";
import type { SampleBuild } from "@/lib/sampleBuilds";
import { track } from "@/lib/analytics";
import { Cart } from "./Cart";
import { Chat, type ChatMessage } from "./Chat";
import { Guide } from "./Guide";

const DEFAULT_REQUIREMENTS: Requirements = { autonomy: "remote_control" };
const PROJECT_KEY = "buildabot.projectId";
const SAVE_DELAY_MS = 800;

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

async function api<T>(method: "GET" | "POST" | "PUT", url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    return res.ok ? { ok: true, data } : { ok: false, status: res.status, error: data };
  } catch {
    return { ok: false, status: 0, error: { error: "network", message: "Couldn't reach the server. Check your connection and try again." } };
  }
}

// The project id lives in localStorage so a returning visitor gets their build back without logging in.
const storedProjectId = () => {
  try {
    return localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
};
const storeProjectId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(PROJECT_KEY, id);
    else localStorage.removeItem(PROJECT_KEY);
  } catch {
    // Private browsing or blocked storage: the build still works, it just won't be remembered.
  }
};

export function Workspace({ parts, samples }: { parts: Part[]; samples: SampleBuild[] }) {
  const projectId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<SaveProjectRequest | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [items, setItems] = useState<BuildItem[]>([]);
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  // Restore the visitor's saved build, if any.
  useEffect(() => {
    const id = storedProjectId();
    if (!id) return;
    let cancelled = false;
    api<ProjectResponse>("GET", `/api/projects/${id}`).then((res) => {
      if (cancelled || projectId.current) return;
      if (!res.ok) {
        if (res.status === 404) storeProjectId(null);
        return;
      }
      projectId.current = id;
      setItems(res.data.items);
      setRequirements(res.data.requirements);
      setMessages(res.data.messages);
      setGuide(res.data.guide);
      setShareSlug(res.data.shareSlug);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureProjectId = () => {
    if (!projectId.current) {
      projectId.current = crypto.randomUUID();
      storeProjectId(projectId.current);
    }
    return projectId.current;
  };

  const flushSave = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const body = pendingSave.current;
    pendingSave.current = null;
    if (!body) return;
    const res = await api("PUT", `/api/projects/${ensureProjectId()}`, body);
    if (!res.ok) setNotice(res.error.message);
  };

  /** Saves hand edits to the cart shortly after the user stops changing things. */
  const scheduleSave = (nextItems: BuildItem[], nextRequirements: Requirements | null) => {
    pendingSave.current = { items: nextItems, requirements: nextRequirements };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY_MS);
  };

  const send = async (text: string) => {
    if (messages.length === 0) track("started", { via: "chat" });
    // The chat request carries the current cart, so a queued cart save is redundant.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = null;
    setMessages((m) => [...m, { role: "user", text }]);
    setChatBusy(true);
    const res = await api<ChatResponse>("POST", "/api/chat", { projectId: ensureProjectId(), message: text, items, requirements } satisfies ChatRequest);
    setChatBusy(false);
    if (!res.ok) {
      setMessages((m) => [...m, { role: "notice", text: res.error.message }]);
      return;
    }
    const { data } = res;
    setMessages((m) => [...m, { role: "assistant", text: data.text, designs: data.designs }]);
    if (data.requirements) setRequirements(data.requirements);
    if (data.build) {
      setItems(data.build.items);
      setSummary(data.build.summary);
      setGuide(null);
      track("build_shown", { via: "advisor", parts: data.build.items.length });
    }
  };

  const loadSample = (sample: SampleBuild) => {
    if (messages.length === 0) track("started", { via: "sample" });
    setItems(sample.items);
    setRequirements(sample.requirements);
    setSummary(sample.tagline);
    setGuide(null);
    scheduleSave(sample.items, sample.requirements);
    track("build_shown", { via: "sample", sample: sample.id });
  };

  const generateGuide = async () => {
    setGuideBusy(true);
    setNotice(null);
    await flushSave();
    const res = await api<GuideResponse>("POST", "/api/guide", { projectId: ensureProjectId(), items, requirements: requirements ?? DEFAULT_REQUIREMENTS } satisfies GuideRequest);
    setGuideBusy(false);
    if (!res.ok) {
      setNotice(res.error.message);
      return;
    }
    setGuide(res.data.markdown);
    track("guide_generated", { parts: items.length });
  };

  const share = async () => {
    setShareBusy(true);
    setNotice(null);
    pendingSave.current ??= { items, requirements };
    await flushSave();
    const res = await api<ShareResponse>("POST", `/api/projects/${ensureProjectId()}/share`);
    setShareBusy(false);
    if (!res.ok) {
      setNotice(res.error.message);
      return;
    }
    setShareSlug(res.data.slug);
  };

  const newBuild = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = null;
    projectId.current = null;
    storeProjectId(null);
    setMessages([]);
    setItems([]);
    setRequirements(null);
    setSummary(null);
    setGuide(null);
    setNotice(null);
    setShareSlug(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-h-[28rem] flex-col lg:sticky lg:top-6 lg:h-[calc(100dvh-7.5rem)]">
          <Chat messages={messages} busy={chatBusy} onSend={send} />
        </div>
        <div>
          <Cart
            parts={parts}
            items={items}
            requirements={requirements ?? DEFAULT_REQUIREMENTS}
            summary={summary}
            samples={samples}
            guideBusy={guideBusy}
            shareUrl={shareSlug ? `${window.location.origin}/b/${shareSlug}` : null}
            shareBusy={shareBusy}
            onItemsChange={(next, event) => {
              setItems(next);
              setGuide(null);
              scheduleSave(next, requirements);
              if (event === "swap") track("part_swapped", {});
            }}
            onRequirementsChange={(next) => {
              setRequirements(next);
              scheduleSave(items, next);
            }}
            onLoadSample={loadSample}
            onGenerateGuide={generateGuide}
            onShare={share}
            onNewBuild={newBuild}
            onRetailerClick={(part) => track("link_clicked", { part: part.id })}
          />
          {notice && (
            <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {notice}
            </p>
          )}
        </div>
      </div>
      {guide && <Guide markdown={guide} onClose={() => setGuide(null)} />}
    </div>
  );
}
