"use client";
// "My robots": the builds made in this browser, so people can come back to any of them, not only
// the latest. Each entry keeps the flow state and a copy of the parts, so a build can be reopened
// even if the server forgot it (memory store restarted, or a different deployment).
import type { BuildItem } from "./compat/types";
import type { CustomPart } from "./cad/spec";
import type { Answers } from "./flow";

const KEY = "buildabot.robots";
const MAX = 30;

export interface SavedFlow {
  step: number;
  maxStep: number;
  answers: Answers;
  customParts?: CustomPart[];
}

export interface RobotEntry {
  id: string;
  title: string;
  /** Set when the user renamed it, so automatic titles don't overwrite it. */
  renamed?: boolean;
  total: number;
  parts: number;
  updatedAt: number;
  flow: SavedFlow;
  items: BuildItem[];
}

export function listRobots(): RobotEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as RobotEntry[]).filter((r) => r && typeof r.id === "string").sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

function writeAll(list: RobotEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX)));
  } catch {
    /* storage full or blocked: the current build still works */
  }
  window.dispatchEvent(new Event("buildabot:robots"));
}

export function upsertRobot(entry: Omit<RobotEntry, "updatedAt" | "renamed"> & { updatedAt?: number }) {
  const list = listRobots();
  const prev = list.find((r) => r.id === entry.id);
  const next: RobotEntry = { ...entry, title: prev?.renamed ? prev.title : entry.title, renamed: prev?.renamed, updatedAt: entry.updatedAt ?? Date.now() };
  // Skip writes that change nothing, so opening a build doesn't move it to the top.
  if (prev && JSON.stringify({ ...prev, updatedAt: 0 }) === JSON.stringify({ ...next, updatedAt: 0 })) return;
  writeAll([next, ...list.filter((r) => r.id !== entry.id)]);
}

export function renameRobot(id: string, title: string) {
  const list = listRobots();
  writeAll(list.map((r) => (r.id === id ? { ...r, title: title.trim().slice(0, 60) || r.title, renamed: true } : r)));
}

export function deleteRobot(id: string) {
  writeAll(listRobots().filter((r) => r.id !== id));
}

export const getRobot = (id: string) => listRobots().find((r) => r.id === id);
