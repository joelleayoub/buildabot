"use client";
// The Showroom flow. Builds are saved to the visitor's project (Supabase, or memory in local dev)
// through /api/projects; the advisor chat, AI guide and share links use the same project id.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiError, ChatRequest, ChatResponse, GuideRequest, GuideResponse, ProjectResponse, SaveProjectRequest, ShareResponse } from "@/lib/advisor/api";
import type { ReferenceDesign } from "@/lib/advisor/tools";
import { track } from "@/lib/analytics";
import { DESIGNS, PARTS, PARTS_BY_ID } from "@/lib/catalog";
import { checkBuild } from "@/lib/compat/checkBuild";
import type { BuildItem, Requirements, Slot } from "@/lib/compat/types";
import { type Answers, type UseCaseId, SLOT_LABELS, findUseCase, requirementsFrom, USE_CASES } from "@/lib/flow";
import { type Locks, normaliseBuild, reasonFor, recommend } from "@/lib/recommend";
import { trySwap } from "@/lib/swap";
import ChatDrawer, { type ChatMessage } from "./ChatDrawer";
import Header from "./Header";
import StepBuild from "./StepBuild";
import { StepRobotType, StepStartFrom, StepUseCase } from "./StepIntro";
import { StepCart, StepGuide, StepWiring } from "./StepOutputs";

const PROJECT_KEY = "buildabot.projectId";
const FLOW_KEY = "buildabot.flow";
const SAVE_DELAY_MS = 800;
const DEFAULT_ANSWERS: Answers = { robotType: "rover", environment: "indoor_flat", experience: "first" };
const DROP_ORDER: Slot[] = ["battery", "regulator", "motor_driver", "controller", "compute", "distance_sensor", "camera", "lidar", "imu", "wheels", "caster", "drive_motor", "chassis"];

interface Flow {
  step: number;
  maxStep: number;
  answers: Answers;
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

async function api<T>(method: "GET" | "POST" | "PUT", url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, { method, ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const data = await res.json();
    return res.ok ? { ok: true, data } : { ok: false, status: res.status, error: data };
  } catch {
    return { ok: false, status: 0, error: { error: "network", message: "Couldn't reach the server. Check your connection and try again." } };
  }
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private browsing or blocked storage: everything still works, it just isn't remembered.
  }
};

/** Best guess at the flow answers for a build that came from the advisor or another device. */
function answersFromRequirements(r: Requirements | null, prev: Answers): Answers {
  if (!r) return prev;
  const byAutonomy: Record<Requirements["autonomy"], UseCaseId> = { remote_control: "drive", obstacle_avoidance: "avoid", mapping_navigation: "map" };
  const useCase = prev.useCase && findUseCase(prev.useCase)!.autonomy === r.autonomy ? prev.useCase : (r.payload_kg ?? 0) >= 2 ? "carry" : byAutonomy[r.autonomy];
  return { ...prev, useCase, environment: r.environment ?? prev.environment, budget: r.budget_usd ?? prev.budget };
}

const withReasons = (items: BuildItem[], answers: Answers) => {
  const uc = findUseCase(answers.useCase) ?? USE_CASES[0];
  return items.filter((i) => PARTS_BY_ID[i.part_id]).map((i) => ({ ...i, reason: i.reason ?? reasonFor(PARTS_BY_ID[i.part_id], answers, uc) }));
};

function readFlow(): Flow | null {
  try {
    return JSON.parse(read(FLOW_KEY) ?? "null");
  } catch {
    return null;
  }
}

export default function Studio() {
  // Rendered client-only (see app/page.tsx), so saved progress can seed the initial state directly.
  const [savedFlow] = useState(readFlow);
  const [step, setStep] = useState(savedFlow?.step ?? 0);
  const [maxStep, setMaxStep] = useState(savedFlow?.maxStep ?? 0);
  const [answers, setAnswers] = useState<Answers>({ ...DEFAULT_ANSWERS, ...savedFlow?.answers });
  const [items, setItems] = useState<BuildItem[]>([]);
  const [selected, setSelected] = useState<Slot>("chassis");
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [aiGuide, setAiGuide] = useState<string | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: BuildItem[] } | null>(null);
  const [ready, setReady] = useState(false);

  const projectId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<SaveProjectRequest | null>(null);

  const ensureProjectId = () => {
    if (!projectId.current) {
      projectId.current = crypto.randomUUID();
      write(PROJECT_KEY, projectId.current);
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
    if (!res.ok) setToast({ text: res.error.message });
  };

  /** Applies a new build and saves it shortly after (the server clears any old AI guide). */
  const applyBuild = (next: BuildItem[], nextAnswers: Answers = answers) => {
    setItems(next);
    setAiGuide(null);
    pendingSave.current = { items: next.map(({ part_id, quantity, reason }) => ({ part_id, quantity, reason })), requirements: requirementsFrom(nextAnswers) };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY_MS);
  };

  // Restore the build itself from the saved project.
  useEffect(() => {
    const flow = savedFlow;
    const restoredAnswers = { ...DEFAULT_ANSWERS, ...flow?.answers };
    const id = read(PROJECT_KEY);
    let cancelled = false;
    if (!id) {
      Promise.resolve().then(() => !cancelled && setReady(true));
      return () => {
        cancelled = true;
      };
    }
    api<ProjectResponse>("GET", `/api/projects/${id}`).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 404) write(PROJECT_KEY, null);
        setReady(true);
        return;
      }
      projectId.current = id;
      const a = flow ? restoredAnswers : answersFromRequirements(res.data.requirements, restoredAnswers);
      setAnswers(a);
      setItems(withReasons(res.data.items, a));
      setMessages(res.data.messages);
      setAiGuide(res.data.guide);
      setShareSlug(res.data.shareSlug);
      if (!flow && res.data.items.length) {
        setStep(3);
        setMaxStep(6);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [savedFlow]);

  useEffect(() => {
    if (ready) write(FLOW_KEY, JSON.stringify({ step, maxStep, answers } satisfies Flow));
  }, [ready, step, maxStep, answers]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  const go = useCallback((n: number) => {
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  }, []);

  const recommended = useMemo(() => (step === 2 && answers.useCase ? recommend(PARTS, answers) : null), [step, answers]);
  const report = useMemo(() => checkBuild(items, PARTS_BY_ID, requirementsFrom(answers)), [items, answers]);

  const startFrom = (designId: string | null) => {
    let rec = recommended ?? recommend(PARTS, answers);
    let note = "";
    if (designId) {
      const d = DESIGNS.find((x) => x.id === designId)!;
      const locks: Locks = {};
      for (const id of d.similar_part_ids) {
        const p = PARTS_BY_ID[id];
        if (p && !locks[p.slot]) locks[p.slot] = id;
      }
      let attempt = recommend(PARTS, answers, locks);
      const dropped: Slot[] = [];
      for (const s of DROP_ORDER) {
        if (attempt) break;
        if (locks[s]) {
          delete locks[s];
          dropped.push(s);
          attempt = recommend(PARTS, answers, locks);
        }
      }
      if (attempt) rec = attempt;
      note = `Started from ${d.name}.` + (dropped.length ? ` I changed the ${dropped.map((s) => SLOT_LABELS[s].toLowerCase()).join(", ")} to fit your answers.` : "");
    }
    if (!rec) return;
    track("started", { via: designId ? "reference" : "recommended" });
    applyBuild(withReasons(rec.items, answers));
    track("build_shown", { via: designId ?? "recommended", parts: rec.items.length });
    setSelected("chassis");
    if (note) setToast({ text: note });
    go(3);
  };

  const swap = (slot: Slot, partId: string | null) => {
    const prev = items;
    const r = trySwap(PARTS, answers, items, slot, partId);
    applyBuild(r.items);
    track("part_swapped", { slot });
    const name = partId ? PARTS_BY_ID[partId].name : SLOT_LABELS[slot];
    const verb = partId === null ? "Removed" : prev.some((i) => PARTS_BY_ID[i.part_id]?.slot === slot) ? "Swapped in" : "Added";
    const also = r.changed.length ? ` Also changed the ${r.changed.map((c) => SLOT_LABELS[c].toLowerCase()).join(", ")} so everything still fits.` : "";
    const bad = r.report.ok ? "" : " This part needs other changes: see Compatibility.";
    setToast({ text: `${verb} ${name}.${also}${bad}`, undo: prev });
  };

  const sendChat = async (text: string) => {
    if (messages.length === 0 && items.length === 0) track("started", { via: "chat" });
    // The chat request carries the current cart, so a queued cart save is redundant.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = null;
    setMessages((m) => [...m, { role: "user", text }]);
    setChatBusy(true);
    const req = items.length ? requirementsFrom(answers) : null;
    const res = await api<ChatResponse>("POST", "/api/chat", {
      projectId: ensureProjectId(),
      message: text,
      items: items.map(({ part_id, quantity, reason }) => ({ part_id, quantity, reason })),
      requirements: req,
    } satisfies ChatRequest);
    setChatBusy(false);
    if (!res.ok) {
      setMessages((m) => [...m, { role: "notice", text: res.error.message }]);
      return;
    }
    const { data } = res;
    setMessages((m) => [...m, { role: "assistant", text: data.text, designs: data.designs as ReferenceDesign[] }]);
    if (data.build) {
      const nextAnswers = answersFromRequirements(data.requirements, answers);
      const prev = items;
      setAnswers(nextAnswers);
      // The server already saved this build to the project, so no extra save is needed.
      setItems(withReasons(normaliseBuild(data.build.items, PARTS_BY_ID), nextAnswers));
      setAiGuide(null);
      track("build_shown", { via: "advisor", parts: data.build.items.length });
      setToast({ text: "buildabot updated your build.", undo: prev.length ? prev : undefined });
      if (step < 3) go(3);
    }
  };

  const generateAiGuide = async () => {
    setGuideBusy(true);
    setGuideError(null);
    pendingSave.current ??= { items, requirements: requirementsFrom(answers) };
    await flushSave();
    const res = await api<GuideResponse>("POST", "/api/guide", {
      projectId: ensureProjectId(),
      items: items.map(({ part_id, quantity, reason }) => ({ part_id, quantity, reason })),
      requirements: requirementsFrom(answers),
    } satisfies GuideRequest);
    setGuideBusy(false);
    if (!res.ok) {
      setGuideError(res.error.error === "advisor_not_configured" ? "The detailed guide is written by the AI advisor, which isn't switched on yet. The step-by-step checklist has everything you need to build it." : res.error.message);
      return;
    }
    setAiGuide(res.data.markdown);
    track("guide_generated", { parts: items.length });
  };

  const share = async () => {
    setShareBusy(true);
    pendingSave.current ??= { items, requirements: requirementsFrom(answers) };
    await flushSave();
    const res = await api<ShareResponse>("POST", `/api/projects/${ensureProjectId()}/share`);
    setShareBusy(false);
    if (!res.ok) {
      setToast({ text: res.error.message });
      return;
    }
    setShareSlug(res.data.slug);
  };

  const startOver = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = null;
    projectId.current = null;
    write(PROJECT_KEY, null);
    setItems([]);
    setMessages([]);
    setAiGuide(null);
    setShareSlug(null);
    setAnswers(DEFAULT_ANSWERS);
    setStep(0);
    setMaxStep(0);
  };

  const shareUrl = shareSlug && typeof window !== "undefined" ? `${window.location.origin}/b/${shareSlug}` : null;

  return (
    <div className="min-h-dvh bg-paper text-ink" style={{ colorScheme: "light" }}>
      <Header step={step} maxStep={maxStep} onStep={go} bagCount={items.length} onChat={() => setChatOpen(true)} />
      <main>
        {step === 0 && <StepRobotType onPick={(id) => (setAnswers({ ...answers, robotType: id }), go(1))} />}
        {step === 1 && <StepUseCase answers={answers} setAnswers={setAnswers} onBack={() => go(0)} onNext={() => go(2)} />}
        {step === 2 && <StepStartFrom answers={answers} recommended={recommended} onStart={startFrom} onBack={() => go(1)} />}
        {step === 3 && items.length > 0 && (
          <StepBuild answers={answers} items={items} report={report} selected={selected} onSelect={setSelected} onSwap={swap} onBack={() => go(2)} onNext={() => go(4)} />
        )}
        {step === 4 && <StepWiring items={items} onBack={() => go(3)} onNext={() => go(5)} />}
        {step === 5 && (
          <StepCart
            items={items}
            report={report}
            shareUrl={shareUrl}
            shareBusy={shareBusy}
            onShare={share}
            onStartOver={startOver}
            onRetailerClick={(id) => track("link_clicked", { part: id })}
            onBack={() => go(4)}
            onNext={() => go(6)}
            onEdit={() => go(3)}
          />
        )}
        {step === 6 && <StepGuide items={items} answers={answers} aiGuide={aiGuide} aiBusy={guideBusy} aiError={guideError} canUseAi={report.ok} onWriteAiGuide={generateAiGuide} onBack={() => go(5)} />}
        {step >= 3 && items.length === 0 && ready && (
          <div className="mx-auto max-w-xl px-4 py-24 text-center">
            <p className="text-lg font-semibold">Your bag is empty</p>
            <p className="mt-1 text-mute">Answer a few questions and I&apos;ll put a build together.</p>
            <button className="mt-4 font-semibold text-blue" onClick={() => go(1)}>
              Choose what it should do
            </button>
          </div>
        )}
      </main>

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-40 flex w-[min(92vw,560px)] -translate-x-1/2 items-start gap-4 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
          <p className="flex-1 leading-snug">{toast.text}</p>
          {toast.undo && (
            <button
              className="shrink-0 font-semibold text-[#9fb0ff]"
              onClick={() => {
                applyBuild(toast.undo!);
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} messages={messages} busy={chatBusy} onSend={sendChat} />
    </div>
  );
}
