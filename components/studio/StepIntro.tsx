"use client";
// Steps 1–3: robot type, use case questions, starting point.
import { PARTS_BY_ID, DESIGNS, money } from "@/lib/catalog";
import { ENVIRONMENTS, EXPERIENCE, OWNED_TOOLS, ROBOT_TYPES, USE_CASES, type Answers, type RobotTypeId, findUseCase } from "@/lib/flow";
import type { Recommendation } from "@/lib/recommend";
import Link from "next/link";
import PartArt from "@/components/PartArt";
import { AdviceBox, Button, StepHeading } from "./ui";

function TypeArt({ id }: { id: RobotTypeId }) {
  const c = "#15171c";
  switch (id) {
    case "rover":
      return (
        <svg viewBox="0 0 200 130" className="h-full w-full">
          <ellipse cx="100" cy="112" rx="70" ry="7" fill="#000" opacity=".08" />
          <rect x="44" y="58" width="112" height="12" rx="4" fill="#bfe0ea" stroke="#8fbccb" />
          <rect x="54" y="40" width="92" height="10" rx="4" fill="#bfe0ea" stroke="#8fbccb" />
          <rect x="62" y="28" width="40" height="12" rx="2" fill="#2f8f3a" />
          <rect x="112" y="20" width="26" height="20" rx="4" fill="#1d1f23" />
          <rect x="92" y="60" width="36" height="16" rx="3" fill="#2a5fb0" />
          <circle cx="70" cy="86" r="22" fill="#1c1d20" />
          <circle cx="70" cy="86" r="12" fill="#f2c230" />
          <circle cx="138" cy="86" r="22" fill="#1c1d20" />
          <circle cx="138" cy="86" r="12" fill="#f2c230" />
          <rect x="150" y="50" width="6" height="18" fill="#2a44f5" />
        </svg>
      );
    case "arm":
      return (
        <svg viewBox="0 0 200 130" className="h-full w-full" fill="none" stroke={c} strokeWidth="9" strokeLinecap="round">
          <ellipse cx="100" cy="114" rx="60" ry="6" fill="#000" stroke="none" opacity=".08" />
          <rect x="70" y="96" width="60" height="16" rx="6" fill="#c9ccd2" stroke="none" />
          <path d="M100 96 L86 54 L136 32" stroke="#9aa0a8" />
          <circle cx="86" cy="54" r="9" fill="#2a44f5" stroke="none" />
          <path d="M136 32 l14 10 M136 32 l18 -4" strokeWidth="5" />
        </svg>
      );
    case "dog":
      return (
        <svg viewBox="0 0 200 130" className="h-full w-full" fill="none" stroke="#9aa0a8" strokeWidth="7" strokeLinecap="round">
          <ellipse cx="100" cy="114" rx="70" ry="6" fill="#000" stroke="none" opacity=".08" />
          <rect x="56" y="42" width="88" height="30" rx="12" fill="#d5d8dd" stroke="none" />
          <rect x="140" y="36" width="26" height="20" rx="6" fill="#1d1f23" stroke="none" />
          <path d="M66 70 l-8 20 l6 20 M88 70 l6 20 l-6 20 M118 70 l-8 20 l6 20 M138 70 l6 20 l-6 20" />
        </svg>
      );
    case "humanoid":
      return (
        <svg viewBox="0 0 200 130" className="h-full w-full">
          <ellipse cx="100" cy="116" rx="44" ry="6" fill="#000" opacity=".08" />
          <rect x="84" y="8" width="32" height="24" rx="10" fill="#d5d8dd" />
          <rect x="90" y="16" width="20" height="7" rx="3" fill="#1d1f23" />
          <rect x="78" y="36" width="44" height="40" rx="10" fill="#d5d8dd" />
          <rect x="88" y="46" width="24" height="14" rx="2" fill="#a9c6ff" />
          <path d="M76 42 l-12 30 M124 42 l12 30" stroke="#9aa0a8" strokeWidth="7" strokeLinecap="round" />
          <rect x="84" y="78" width="32" height="20" rx="4" fill="#9aa0a8" />
          <rect x="74" y="96" width="52" height="14" rx="6" fill="#d5d8dd" />
          <circle cx="82" cy="112" r="6" fill="#1c1d20" />
          <circle cx="118" cy="112" r="6" fill="#1c1d20" />
        </svg>
      );
  }
}

export function StepRobotType({ onPick }: { onPick: (id: RobotTypeId) => void }) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-16">
      <StepHeading kicker="Let's build your first robot" title="What do you want to build?">
        Pick a body type. I&apos;ll ask what it&apos;s for, suggest proven designs, and put together a parts list that works together.
      </StepHeading>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROBOT_TYPES.map((t) => {
          // The arm builder isn't here yet, but the arm advisor (/arm) sizes one for a task.
          const preview = t.id === "arm";
          const inner = (
            <>
              <div className="aspect-[4/3] bg-stage-2 p-6">
                <TypeArt id={t.id} />
              </div>
              <div className="flex flex-1 flex-col gap-1 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{t.name}</span>
                  {preview ? (
                    <span className="rounded-full bg-blue-soft px-2.5 py-0.5 text-xs font-semibold text-blue">Preview</span>
                  ) : (
                    !t.available && <span className="rounded-full bg-stage px-2.5 py-0.5 text-xs font-medium text-mute">Coming later</span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-mute">{t.blurb}</p>
                {t.available && <span className="mt-3 text-sm font-semibold text-blue">Start with a rover</span>}
                {preview && <span className="mt-3 text-sm font-semibold text-blue">Size an arm for a task</span>}
              </div>
            </>
          );
          const cls = "group flex flex-col overflow-hidden rounded-3xl border text-left transition";
          return preview ? (
            <Link key={t.id} href="/arm" className={`${cls} border-line hover:border-ink`}>
              {inner}
            </Link>
          ) : (
            <button key={t.id} disabled={!t.available} onClick={() => onPick(t.id)} className={`${cls} ${t.available ? "border-line hover:border-ink" : "border-line opacity-70"}`}>
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Choice({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left transition ${active ? "border-blue bg-blue-soft ring-1 ring-blue" : "border-line hover:border-ink"}`}
    >
      <span className="block font-semibold">{title}</span>
      {body && <span className="mt-1 block text-sm leading-snug text-mute">{body}</span>}
    </button>
  );
}

export function StepUseCase({ answers, setAnswers, onNext, onBack }: { answers: Answers; setAnswers: (a: Answers) => void; onNext: () => void; onBack: () => void }) {
  const uc = findUseCase(answers.useCase);
  const env = ENVIRONMENTS.find((e) => e.id === answers.environment)!;
  const budget = answers.budget ?? uc?.defaultBudget ?? 100;
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <StepHeading kicker="Your rover" title="What should it do?">
        A few quick questions. Each answer changes which parts I pick.
      </StepHeading>

      <fieldset className="mt-10">
        <legend className="text-lg font-bold">1. Its main job</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u) => (
            <Choice key={u.id} active={answers.useCase === u.id} onClick={() => setAnswers({ ...answers, useCase: u.id, budget: undefined })} title={u.name} body={u.blurb} />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-10">
        <legend className="text-lg font-bold">2. Where it will drive</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {ENVIRONMENTS.map((e) => (
            <Choice key={e.id} active={answers.environment === e.id} onClick={() => setAnswers({ ...answers, environment: e.id })} title={e.name} />
          ))}
        </div>
        <div className="mt-3 max-w-2xl">
          <AdviceBox>{env.advice}</AdviceBox>
        </div>
      </fieldset>

      <fieldset className="mt-10">
        <legend className="text-lg font-bold">3. Your experience</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {EXPERIENCE.map((e) => (
            <Choice key={e.id} active={answers.experience === e.id} onClick={() => setAnswers({ ...answers, experience: e.id })} title={e.name} body={e.blurb} />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-10">
        <legend className="text-lg font-bold">4. Tools you already have</legend>
        <p className="mt-1 text-sm text-mute">Pick any you own, so the cost of what you still need is right. Skip it if you have none.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OWNED_TOOLS.map((t) => {
            const on = answers.owned?.includes(t.id) ?? false;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setAnswers({ ...answers, owned: on ? (answers.owned ?? []).filter((x) => x !== t.id) : [...(answers.owned ?? []), t.id] })}
                className={`h-10 rounded-full border px-4 text-sm font-medium transition ${on ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}
              >
                {on ? "✓ " : ""}
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {uc && (
        <fieldset className="mt-10 max-w-xl">
          <legend className="text-lg font-bold">Budget</legend>
          <div className="mt-3 flex items-center gap-4">
            <input
              type="range"
              min={40}
              max={1200}
              step={10}
              value={budget}
              onChange={(e) => setAnswers({ ...answers, budget: Number(e.target.value) })}
              className="w-full accent-[var(--blue)]"
              aria-label="Budget in US dollars"
            />
            <span className="num w-20 text-right text-xl font-bold">{money(budget)}</span>
          </div>
          <p className="mt-1 text-sm text-mute">A {uc.name.toLowerCase()} build usually costs from {money(uc.defaultBudget * 0.6)}.</p>
        </fieldset>
      )}

      <div className="mt-12 flex gap-3">
        <Button onClick={onBack}>Back</Button>
        <Button variant="dark" disabled={!uc} onClick={onNext}>
          See starting points
        </Button>
      </div>
    </section>
  );
}

export function StepStartFrom({
  answers,
  recommended,
  onStart,
  onBack,
}: {
  answers: Answers;
  recommended: Recommendation | null;
  onStart: (designId: string | null) => void;
  onBack: () => void;
}) {
  const uc = findUseCase(answers.useCase)!;
  const rank = { remote_control: 0, obstacle_avoidance: 1, mapping_navigation: 2 } as const;
  const designs = DESIGNS.filter((d) => Math.abs(rank[d.autonomy] - rank[uc.autonomy]) <= (uc.autonomy === "remote_control" ? 1 : 0)).slice(0, 3);
  const recParts = recommended?.items.map((i) => PARTS_BY_ID[i.part_id]).filter(Boolean) ?? [];
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <StepHeading kicker={uc.name} title="Pick a starting point">
        Start from my recommended build, or from an open-source design people have already built. You can change any part on the next step.
      </StepHeading>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {recommended ? (
          <article className="flex flex-col rounded-3xl border-2 border-ink p-6">
            <span className="w-fit rounded-full bg-blue px-3 py-1 text-xs font-semibold text-white">Recommended for you</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">Your custom rover</h2>
            <p className="mt-1 text-mute">Picked for {ENVIRONMENTS.find((e) => e.id === answers.environment)!.name.toLowerCase()} and {answers.experience === "first" ? "a first build" : "your experience"}. Every part checked to work together.</p>
            <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {recParts.slice(0, 12).map((p) => (
                <div key={p.id} className="aspect-[4/3] rounded-xl bg-stage-2 p-1.5" title={p.name}>
                  <PartArt part={p} className="h-full w-full" />
                </div>
              ))}
            </div>
            <dl className="num mt-6 flex gap-8">
              <div>
                <dt className="text-xs text-mute">Parts</dt>
                <dd className="text-xl font-bold">{recParts.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-mute">About</dt>
                <dd className="text-xl font-bold">{money(recommended.report.totals.price_usd_approx)}</dd>
              </div>
              <div>
                <dt className="text-xs text-mute">Runtime</dt>
                <dd className="text-xl font-bold">{recommended.report.totals.est_runtime_min ? `${Math.round(recommended.report.totals.est_runtime_min)} min` : "–"}</dd>
              </div>
            </dl>
            {recommended.report.issues.some((i) => i.code === "OVER_BUDGET") && (
              <p className="mt-4 rounded-xl bg-warn-soft px-3.5 py-2 text-sm text-warn">
                This is the lowest-cost build I can find that does the job, at about {money(recommended.report.totals.price_usd_approx)}: over your {money(recommended.requirements.budget_usd ?? 0)} budget. A simpler job costs less.
              </p>
            )}
            <div className="mt-auto pt-6">
              <Button variant="primary" onClick={() => onStart(null)}>
                Start from this build
              </Button>
            </div>
          </article>
        ) : (
          <article className="rounded-3xl border border-line p-6">
            <h2 className="text-xl font-bold">No compatible build at this budget</h2>
            <p className="mt-2 text-mute">Raise the budget or pick a simpler job, and I&apos;ll try again.</p>
            <Button className="mt-4" onClick={onBack}>
              Change answers
            </Button>
          </article>
        )}

        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-mute">Open-source designs like this</h2>
          {designs.map((d) => (
            <article key={d.id} className="rounded-3xl border border-line p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold">{d.name}</h3>
                <span className="num shrink-0 text-sm text-mute">
                  {money(d.approx_cost_usd[0])}–{money(d.approx_cost_usd[1])}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-mute">{d.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => onStart(d.id)}>Start from {d.name.split(" (")[0]}</Button>
                <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center px-3 text-sm font-semibold text-blue hover:underline">
                  View project
                </a>
              </div>
            </article>
          ))}
          {!designs.length && <p className="text-sm text-mute">No close open-source match yet. The recommended build is your best start.</p>}
        </div>
      </div>
      <div className="mt-10">
        <Button onClick={onBack}>Back</Button>
      </div>
    </section>
  );
}

