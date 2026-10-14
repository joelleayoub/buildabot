"use client";
// "My robots" drawer: every build made in this browser, to reopen, rename, copy or delete.
import { useEffect, useState, useSyncExternalStore } from "react";
import { money } from "@/lib/catalog";
import { ENVIRONMENTS, findUseCase } from "@/lib/flow";
import { deleteRobot, listRobots, renameRobot, type RobotEntry } from "@/lib/myRobots";
import { Button } from "./ui";

let cache: { raw: string; list: RobotEntry[] } = { raw: "", list: [] };
function snapshot(): RobotEntry[] {
  let raw = "";
  try {
    raw = localStorage.getItem("buildabot.robots") ?? "";
  } catch {
    /* blocked */
  }
  if (raw !== cache.raw) cache = { raw, list: listRobots() };
  return cache.list;
}
const subscribe = (cb: () => void) => {
  window.addEventListener("buildabot:robots", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("buildabot:robots", cb);
    window.removeEventListener("storage", cb);
  };
};
export const useRobots = () => useSyncExternalStore(subscribe, snapshot, () => []);

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default function MyRobots({ open, currentId, onClose, onOpen, onDuplicate, onNew, onDeleted }: { open: boolean; currentId: string | null; onClose: () => void; onOpen: (r: RobotEntry) => void; onDuplicate: (r: RobotEntry) => void; onNew: () => void; onDeleted: (id: string) => void }) {
  const robots = useRobots();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="My robots" className="flex h-full w-full max-w-[440px] flex-col bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">My robots</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-stage-2">
            ✕
          </button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-4">
          {robots.length === 0 && <p className="rounded-2xl bg-stage-2 p-4 text-sm text-mute">Builds you start are kept here, in this browser, so you can come back to any of them.</p>}
          {robots.map((r) => {
            const current = r.id === currentId;
            const uc = findUseCase(r.flow.answers.useCase);
            return (
              <div key={r.id} className={`rounded-2xl border p-4 ${current ? "border-ink" : "border-line"}`}>
                {editing === r.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameRobot(r.id, name);
                      setEditing(null);
                    }}
                  >
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Robot name" maxLength={60} className="h-9 min-w-0 flex-1 rounded-full border border-line px-3 text-sm outline-none focus:border-ink" />
                    <Button variant="dark" className="h-9 px-4" type="submit">
                      Save
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {current && <span className="mb-1 inline-block rounded-full bg-blue-soft px-2 py-0.5 text-[0.68rem] font-semibold text-blue">Open now</span>}
                      <p className="font-semibold leading-snug">{r.title}</p>
                      <p className="text-sm text-mute">
                        {r.renamed && uc ? `${uc.name} · ` : ""}
                        {ENVIRONMENTS.find((e) => e.id === r.flow.answers.environment)?.name ?? "Rover"} · {r.parts} parts · ~{money(r.total)} · {ago(r.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditing(r.id);
                        setName(r.title);
                      }}
                      className="shrink-0 text-xs font-semibold text-mute hover:text-ink"
                    >
                      Rename
                    </button>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!current && (
                    <Button variant="dark" className="h-9 px-4" onClick={() => onOpen(r)}>
                      Open
                    </Button>
                  )}
                  <Button className="h-9 px-4" onClick={() => onDuplicate(r)}>
                    Make a copy
                  </Button>
                  {confirm === r.id ? (
                    <Button
                      className="h-9 border-bad px-4 text-bad"
                      onClick={() => {
                        deleteRobot(r.id);
                        setConfirm(null);
                        onDeleted(r.id);
                      }}
                    >
                      Yes, delete
                    </Button>
                  ) : (
                    <Button variant="ghost" className="h-9 px-3 text-mute" onClick={() => setConfirm(r.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-4">
          <Button variant="primary" className="w-full" onClick={onNew}>
            Start a new robot
          </Button>
          <p className="mt-2 text-center text-xs text-mute">Saved in this browser. Use Share on the Cart step to open a build on another device.</p>
        </div>
      </aside>
    </div>
  );
}
