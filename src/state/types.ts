// 应用文档（进撤销/重做历史）与 UI 状态（光标、窗宽窗位、工具、候选轮廓等）
import type { Vec3, ViewId, WindowLevel } from '../domain/types';
import type { Adoption } from '../domain/reconstruction';

export interface DefectLabel {
  id: string;
  name: string;
  /** 显示颜色（CSS 色） */
  color: string;
}

/** 可持久化文档：标签 + 编辑历史的当前内容（表面也以编辑记录表达，可撤销） */
export interface DocState {
  labels: DefectLabel[];
  adoptions: Adoption[];
}

export type ToolId =
  | 'navigate'
  | 'contour'
  | 'defect-brush'
  | 'defect-erase'
  | 'surface-brush'
  | 'surface-erase';

export interface CandidateContour {
  view: ViewId;
  depth: number;
  points: { a: number; b: number }[];
  closed: boolean;
}

export interface UIState {
  datasetId: string;
  cursor: Vec3;
  depths: Record<ViewId, number>;
  window: WindowLevel;
  tool: ToolId;
  brushRadius: number;
  activeLabelId: string | null;
  selectedDefectId: string | null;
  candidate: CandidateContour | null;
  /** 3D 预览是否自转 */
  autoRotate: boolean;
}

export const LABEL_COLORS = ['#ff5d5d', '#ffb020', '#42d96b', '#5db8ff', '#c487ff', '#ff7ac6'];

export function emptyDoc(): DocState {
  return { labels: [], adoptions: [] };
}
