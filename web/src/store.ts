import { create } from "zustand";
import type { Direction } from "@cairn/shared";

export interface EditableInstruction {
  id: string;
  fwdMile: string;
  direction: Direction | "";
  text: string;
  gpsRaw: string;
}

export interface EditableSegment {
  id: string;
  name: string;
  instructions: EditableInstruction[];
}

export interface PageImage {
  id: string;
  name: string;
  url: string;
}

export interface RouteState {
  view: "upload" | "review";
  name: string;
  segments: EditableSegment[];
  pages: PageImage[];
  setView: (view: "upload" | "review") => void;
  setRouteName: (name: string) => void;
  addPages: (pages: PageImage[]) => void;
  removePage: (id: string) => void;
  movePage: (from: number, to: number) => void;
  addSegment: () => void;
  updateSegmentName: (segId: string, name: string) => void;
  removeSegment: (segId: string) => void;
  moveSegment: (from: number, to: number) => void;
  addRow: (segId: string) => void;
  updateRow: (segId: string, rowId: string, patch: Partial<EditableInstruction>) => void;
  removeRow: (segId: string, rowId: string) => void;
  moveRow: (segId: string, from: number, to: number) => void;
}

const uid = () => crypto.randomUUID();

function emptyRow(): EditableInstruction {
  return { id: uid(), fwdMile: "", direction: "", text: "", gpsRaw: "" };
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const useRouteStore = create<RouteState>((set) => ({
  view: "upload",
  name: "",
  segments: [],
  pages: [],

  setView: (view) => set({ view }),
  setRouteName: (name) => set({ name }),

  addPages: (pages) => set((s) => ({ pages: [...s.pages, ...pages] })),
  removePage: (id) => set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),
  movePage: (from, to) => set((s) => ({ pages: move(s.pages, from, to) })),

  addSegment: () =>
    set((s) => ({ segments: [...s.segments, { id: uid(), name: "", instructions: [emptyRow()] }] })),
  updateSegmentName: (segId, name) =>
    set((s) => ({ segments: s.segments.map((seg) => (seg.id === segId ? { ...seg, name } : seg)) })),
  removeSegment: (segId) => set((s) => ({ segments: s.segments.filter((seg) => seg.id !== segId) })),
  moveSegment: (from, to) => set((s) => ({ segments: move(s.segments, from, to) })),

  addRow: (segId) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId ? { ...seg, instructions: [...seg.instructions, emptyRow()] } : seg,
      ),
    })),
  updateRow: (segId, rowId, patch) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId
          ? {
              ...seg,
              instructions: seg.instructions.map((row) =>
                row.id === rowId ? { ...row, ...patch } : row,
              ),
            }
          : seg,
      ),
    })),
  removeRow: (segId, rowId) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId
          ? { ...seg, instructions: seg.instructions.filter((row) => row.id !== rowId) }
          : seg,
      ),
    })),
  moveRow: (segId, from, to) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId ? { ...seg, instructions: move(seg.instructions, from, to) } : seg,
      ),
    })),
}));
