/**
 * 全局状态：React useReducer + localStorage 持久化（刷新恢复）。
 * 持久化内容：数据来源（模拟 id 或导入清单 JSON）、轮廓历史、窗宽窗位、自动表面开关。
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { CandidateContour, Contour, Plane, Volume } from '../core/types';
import {
  createHistory,
  deserializeHistory,
  pushHistory,
  redoHistory,
  serializeHistory,
  undoHistory,
  type HistoryState,
} from '../core/history';
import { generateSimVolume, SIM_SOURCE_COMPLETE } from '../core/simdata';
import { buildVolumeFromManifest, parseManifest } from '../core/importManifest';
import { computeDerived, type Derived } from './derived';

export type Tool = 'crosshair' | 'draw-defect' | 'draw-surface' | 'erase';

export interface AppState {
  volume: Volume | null;
  /** 导入清单原文（用于刷新后重建体数据；模拟数据只存 sourceId） */
  importJson: string | null;
  contoursHist: HistoryState<Contour[]>;
  autoSurface: boolean;
  cursor: [number, number, number] | null;
  slices: Record<Plane, number>;
  wl: { w: number; c: number };
  tool: Tool;
  candidate: CandidateContour & { closed: boolean } | null;
  selectedDefect: number | null;
  importOpen: boolean;
  importError: string | null;
}

export type Action =
  | { type: 'LOAD_SIM'; sourceId: string }
  | { type: 'LOAD_IMPORT'; json: string }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_WL'; wl: { w: number; c: number } }
  | { type: 'SET_SLICE'; plane: Plane; index: number }
  | { type: 'SET_CURSOR'; voxel: [number, number, number] }
  | { type: 'CANDIDATE_POINT'; plane: Plane; sliceIndex: number; kind: 'defect' | 'surface'; u: number; v: number }
  | { type: 'CANDIDATE_CLOSE' }
  | { type: 'CANDIDATE_UNDO_POINT' }
  | { type: 'CANDIDATE_ADOPT' }
  | { type: 'CANDIDATE_CANCEL' }
  | { type: 'DELETE_CONTOUR'; id: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_AUTO_SURFACE'; on: boolean }
  | { type: 'SELECT_DEFECT'; id: number | null }
  | { type: 'SET_IMPORT_OPEN'; open: boolean }
  | { type: 'CLEAR_ANNOTATIONS' };

const STORAGE_KEY = 'ct-review-v1';

function defaultSlices(volume: Volume | null): Record<Plane, number> {
  if (!volume) return { axial: 0, coronal: 0, sagittal: 0 };
  const [nx, ny, nz] = volume.meta.dims;
  return {
    axial: Math.floor(nz / 2),
    coronal: Math.floor(ny / 2),
    sagittal: Math.floor(nx / 2),
  };
}

function initialState(): AppState {
  const base: AppState = {
    volume: null,
    importJson: null,
    contoursHist: createHistory<Contour[]>([]),
    autoSurface: false,
    cursor: null,
    slices: { axial: 0, coronal: 0, sagittal: 0 },
    wl: { w: 1200, c: 500 },
    tool: 'crosshair',
    candidate: null,
    selectedDefect: null,
    importOpen: false,
    importError: null,
  };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...base, volume: generateSimVolume(SIM_SOURCE_COMPLETE), slices: defaultSlices(generateSimVolume(SIM_SOURCE_COMPLETE)) };
  }
  if (!raw) {
    const v = generateSimVolume(SIM_SOURCE_COMPLETE);
    return { ...base, volume: v, slices: defaultSlices(v) };
  }
  try {
    const saved = JSON.parse(raw) as {
      sourceId?: string;
      importJson?: string | null;
      contoursHist?: string;
      autoSurface?: boolean;
      wl?: { w: number; c: number };
    };
    let volume: Volume | null = null;
    if (saved.sourceId === 'import' && saved.importJson) {
      const { manifest, error } = parseManifest(saved.importJson);
      if (!error && manifest) {
        const r = buildVolumeFromManifest(manifest);
        volume = r.volume;
      }
    } else if (saved.sourceId) {
      volume = generateSimVolume(saved.sourceId);
    }
    if (!volume) volume = generateSimVolume(SIM_SOURCE_COMPLETE);
    return {
      ...base,
      volume,
      importJson: saved.sourceId === 'import' ? saved.importJson ?? null : null,
      contoursHist: deserializeHistory<Contour[]>(saved.contoursHist ?? null, []),
      autoSurface: saved.autoSurface ?? false,
      wl: saved.wl ?? base.wl,
      slices: defaultSlices(volume),
    };
  } catch {
    const v = generateSimVolume(SIM_SOURCE_COMPLETE);
    return { ...base, volume: v, slices: defaultSlices(v) };
  }
}

let contourSeq = 1;
function nextContourId(): string {
  return `c${Date.now().toString(36)}-${contourSeq++}`;
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'LOAD_SIM': {
      const volume = generateSimVolume(a.sourceId);
      return {
        ...s,
        volume,
        importJson: null,
        slices: defaultSlices(volume),
        cursor: null,
        candidate: null,
        selectedDefect: null,
        contoursHist: createHistory([]),
        autoSurface: false,
        importError: null,
      };
    }
    case 'LOAD_IMPORT': {
      const { manifest, error } = parseManifest(a.json);
      if (error || !manifest) return { ...s, importError: error ?? '清单解析失败' };
      const { volume, errors } = buildVolumeFromManifest(manifest);
      if (!volume) return { ...s, importError: errors.join('；') };
      return {
        ...s,
        volume,
        importJson: a.json,
        slices: defaultSlices(volume),
        cursor: null,
        candidate: null,
        selectedDefect: null,
        contoursHist: createHistory([]),
        autoSurface: false,
        importOpen: false,
        importError: null,
      };
    }
    case 'SET_TOOL':
      return { ...s, tool: a.tool, candidate: null };
    case 'SET_WL':
      return { ...s, wl: a.wl };
    case 'SET_SLICE': {
      let max = 0;
      if (s.volume) {
        const [nx, ny, nz] = s.volume.meta.dims;
        max = (a.plane === 'axial' ? nz : a.plane === 'coronal' ? ny : nx) - 1;
      }
      const idx = Math.max(0, Math.min(max, Math.round(a.index)));
      return { ...s, slices: { ...s.slices, [a.plane]: idx } };
    }
    case 'SET_CURSOR': {
      const [x, y, z] = a.voxel;
      return {
        ...s,
        cursor: a.voxel,
        slices: { axial: z, coronal: y, sagittal: x },
      };
    }
    case 'CANDIDATE_POINT': {
      // 候选轮廓绑定起始 (plane, sliceIndex, kind)；跨层/跨面则重新开始
      const cur = s.candidate;
      if (!cur || cur.plane !== a.plane || cur.sliceIndex !== a.sliceIndex || cur.kind !== a.kind) {
        return {
          ...s,
          candidate: { plane: a.plane, sliceIndex: a.sliceIndex, kind: a.kind, points: [[a.u, a.v]], closed: false },
        };
      }
      if (cur.closed) return s;
      // 点击靠近首点 → 闭合
      if (cur.points.length >= 3) {
        const [u0, v0] = cur.points[0];
        if (Math.hypot(a.u - u0, a.v - v0) < 1.5) {
          return { ...s, candidate: { ...cur, closed: true } };
        }
      }
      return { ...s, candidate: { ...cur, points: [...cur.points, [a.u, a.v]] } };
    }
    case 'CANDIDATE_CLOSE':
      if (!s.candidate || s.candidate.points.length < 3) return s;
      return { ...s, candidate: { ...s.candidate, closed: true } };
    case 'CANDIDATE_UNDO_POINT': {
      if (!s.candidate) return s;
      const points = s.candidate.points.slice(0, -1);
      return { ...s, candidate: points.length ? { ...s.candidate, points, closed: false } : null };
    }
    case 'CANDIDATE_ADOPT': {
      const c = s.candidate;
      if (!c || c.points.length < 2) return s;
      const contour: Contour = {
        id: nextContourId(),
        kind: c.kind,
        plane: c.plane,
        sliceIndex: c.sliceIndex,
        points: c.points,
        closed: c.closed && c.points.length >= 3,
      };
      return { ...s, candidate: null, contoursHist: pushHistory(s.contoursHist, [...s.contoursHist.present, contour]) };
    }
    case 'CANDIDATE_CANCEL':
      return { ...s, candidate: null };
    case 'DELETE_CONTOUR': {
      const next = s.contoursHist.present.filter((c) => c.id !== a.id);
      if (next.length === s.contoursHist.present.length) return s;
      return { ...s, contoursHist: pushHistory(s.contoursHist, next) };
    }
    case 'UNDO':
      return { ...s, contoursHist: undoHistory(s.contoursHist) };
    case 'REDO':
      return { ...s, contoursHist: redoHistory(s.contoursHist) };
    case 'SET_AUTO_SURFACE':
      return { ...s, autoSurface: a.on };
    case 'SELECT_DEFECT':
      return { ...s, selectedDefect: a.id };
    case 'SET_IMPORT_OPEN':
      return { ...s, importOpen: a.open, importError: null };
    case 'CLEAR_ANNOTATIONS':
      return { ...s, contoursHist: pushHistory(s.contoursHist, []), selectedDefect: null };
    default:
      return s;
  }
}

interface Store {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  derived: Derived;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // 刷新恢复：持久化来源 + 轮廓历史 + 窗宽窗位
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sourceId: state.volume?.sourceId ?? null,
          importJson: state.importJson,
          contoursHist: serializeHistory(state.contoursHist),
          autoSurface: state.autoSurface,
          wl: state.wl,
        }),
      );
    } catch {
      /* 存储不可用时静默 */
    }
  }, [state.volume, state.importJson, state.contoursHist, state.autoSurface, state.wl]);

  const derived = useMemo(
    () => computeDerived(state.volume, state.contoursHist.present, state.autoSurface),
    [state.volume, state.contoursHist, state.autoSurface],
  );

  const value = useMemo(() => ({ state, dispatch, derived }), [state, derived]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
