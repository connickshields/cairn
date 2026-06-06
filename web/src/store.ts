import { create } from "zustand";
import type { Direction, GeoPoint } from "@cairn/shared";

export interface SegmentSnap {
  legs: { snapped: boolean; points: GeoPoint[] }[];
}

export interface EditableInstruction {
  id: string;
  fwdMile: string;
  direction: Direction | "";
  text: string;
  gpsRaw: string;
  flagged: boolean;
  note: string;
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
  snapEnabled: boolean;
  snapped: Record<string, SegmentSnap>;
  setSnapEnabled: (v: boolean) => void;
  setSnapped: (map: Record<string, SegmentSnap>) => void;
  clearSnap: () => void;
  setView: (view: "upload" | "review") => void;
  setRouteName: (name: string) => void;
  addPages: (pages: PageImage[]) => void;
  removePage: (id: string) => void;
  movePage: (from: number, to: number) => void;
  addSegment: () => void;
  appendSegments: (segments: EditableSegment[]) => void;
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
  return { id: uid(), fwdMile: "", direction: "", text: "", gpsRaw: "", flagged: false, note: "" };
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
  snapEnabled: false,
  snapped: {},
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setSnapped: (map) => set({ snapped: map }),
  clearSnap: () => set({ snapEnabled: false, snapped: {} }),

  setView: (view) => set({ view }),
  setRouteName: (name) => set({ name }),

  addPages: (pages) => set((s) => ({ pages: [...s.pages, ...pages] })),
  removePage: (id) => set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),
  movePage: (from, to) => set((s) => ({ pages: move(s.pages, from, to) })),

  addSegment: () =>
    set((s) => ({
      segments: [...s.segments, { id: uid(), name: "", instructions: [emptyRow()] }],
      snapEnabled: false,
      snapped: {},
    })),
  appendSegments: (segments) =>
    set((s) => ({
      segments: [...s.segments, ...segments],
      snapEnabled: false,
      snapped: {},
    })),
  updateSegmentName: (segId, name) =>
    set((s) => ({
      segments: s.segments.map((seg) => (seg.id === segId ? { ...seg, name } : seg)),
      snapEnabled: false,
      snapped: {},
    })),
  removeSegment: (segId) =>
    set((s) => ({
      segments: s.segments.filter((seg) => seg.id !== segId),
      snapEnabled: false,
      snapped: {},
    })),
  moveSegment: (from, to) =>
    set((s) => ({
      segments: move(s.segments, from, to),
      snapEnabled: false,
      snapped: {},
    })),

  addRow: (segId) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId ? { ...seg, instructions: [...seg.instructions, emptyRow()] } : seg,
      ),
      snapEnabled: false,
      snapped: {},
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
      snapEnabled: false,
      snapped: {},
    })),
  removeRow: (segId, rowId) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId
          ? { ...seg, instructions: seg.instructions.filter((row) => row.id !== rowId) }
          : seg,
      ),
      snapEnabled: false,
      snapped: {},
    })),
  moveRow: (segId, from, to) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId ? { ...seg, instructions: move(seg.instructions, from, to) } : seg,
      ),
      snapEnabled: false,
      snapped: {},
    })),
}));
