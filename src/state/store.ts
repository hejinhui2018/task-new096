// 应用状态中心：数据集注册、撤销历史、派生重建、十字光标与工具动作
import { History } from '../domain/history';
import { fromLinear } from '../domain/coordinates';
import {
  buildFullMock,
  buildMissingSliceMock,
  type MockDataset,
  type MockGroundTruth,
} from '../domain/mock';
import { reconstruct, type Adoption, type ReconstructionResult } from '../domain/reconstruction';
import type { Volume } from '../domain/types';
import { clearDoc, loadDoc, loadUI, saveDoc, saveUI } from './persistence';
import {
  type CandidateContour,
  type DefectLabel,
  type DocState,
  emptyDoc,
  LABEL_COLORS,
  type ToolId,
  type UIState,
} from './types';
import type { Vec3, ViewId, WindowLevel } from '../domain/types';

export interface Dataset {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  volume: Volume;
  presentZs: number[];
  /** 内置模拟件的标准答案（用于一键播种演示标记） */
  truth?: MockGroundTruth;
}

function fromMock(m: MockDataset): Dataset {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    builtin: true,
    volume: m.volume,
    presentZs: m.volume.slices.map((s) => s.z),
    truth: m.truth,
  };
}

const BUILTIN: Dataset[] = [fromMock(buildFullMock()), fromMock(buildMissingSliceMock())];

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type Listener = () => void;

export class AppStore {
  private datasets = new Map<string, Dataset>(BUILTIN.map((d) => [d.id, d]));
  private listeners = new Set<Listener>();

  datasetId: string;
  dataset: Dataset;
  history: History<DocState>;
  ui: UIState;
  reconstruction: ReconstructionResult;
  private version = 0;

  getVersion = (): number => this.version;

  constructor() {
    this.history = loadDoc() ?? new History<DocState>(emptyDoc());
    const restoredUI = loadUI();
    this.datasetId = restoredUI?.datasetId && this.datasets.has(restoredUI.datasetId)
      ? restoredUI.datasetId
      : BUILTIN[0].id;
    // 若恢复的文档属于找不到的自定义数据集，则丢弃文档
    if (restoredUI?.datasetId && !this.datasets.has(restoredUI.datasetId)) {
      this.history = new History<DocState>(emptyDoc());
      clearDoc();
    }
    this.dataset = this.datasets.get(this.datasetId)!;
    const dims = this.dataset.volume.meta.dims;
    const mid: Vec3 = { x: (dims.x / 2) | 0, y: (dims.y / 2) | 0, z: (dims.z / 2) | 0 };
    const defWin: WindowLevel = {
      center: (this.dataset.volume.meta.intensityRange.min + this.dataset.volume.meta.intensityRange.max) / 2,
      width: this.dataset.volume.meta.intensityRange.max - this.dataset.volume.meta.intensityRange.min,
    };
    this.ui = {
      datasetId: this.datasetId,
      cursor: mid,
      depths: { axial: mid.z, sagittal: mid.x, coronal: mid.y },
      window: restoredUI?.window ?? defWin,
      tool: restoredUI?.tool ?? 'contour',
      brushRadius: restoredUI?.brushRadius ?? 1,
      activeLabelId: restoredUI?.activeLabelId ?? null,
      selectedDefectId: restoredUI?.selectedDefectId ?? null,
      candidate: null,
      autoRotate: restoredUI?.autoRotate ?? true,
    };
    this.reconstruction = this.runReconstruct();
  }

  // ---------- 订阅 ----------
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  get doc(): DocState {
    return this.history.current;
  }

  private runReconstruct(): ReconstructionResult {
    return reconstruct({
      meta: this.dataset.volume.meta,
      presentZs: this.dataset.presentZs,
      adoptions: this.doc.adoptions,
      surfaceVoxels: [],
    });
  }

  private commit(next: DocState, persist = true) {
    this.history.commit(next);
    this.reconstruction = this.runReconstruct();
    if (persist) saveDoc(this.history);
    this.emit();
  }

  private replaceHistoryPoint() {
    this.reconstruction = this.runReconstruct();
    saveDoc(this.history);
    this.emit();
  }

  private patchUI(patch: Partial<UIState>, persist = true) {
    this.ui = { ...this.ui, ...patch };
    if (persist) saveUI(this.ui);
    this.emit();
  }

  // ---------- 数据集 ----------
  listDatasets(): Dataset[] {
    return [...this.datasets.values()];
  }

  registerCustomDataset(ds: Dataset) {
    this.datasets.set(ds.id, ds);
  }

  loadDataset(id: string) {
    const ds = this.datasets.get(id);
    if (!ds || id === this.datasetId) return;
    this.datasetId = id;
    this.dataset = ds;
    const dims = ds.volume.meta.dims;
    this.history = new History<DocState>(emptyDoc());
    const win: WindowLevel = {
      center: (ds.volume.meta.intensityRange.min + ds.volume.meta.intensityRange.max) / 2,
      width: ds.volume.meta.intensityRange.max - ds.volume.meta.intensityRange.min,
    };
    this.ui = {
      datasetId: id,
      cursor: { x: (dims.x / 2) | 0, y: (dims.y / 2) | 0, z: (dims.z / 2) | 0 },
      depths: { axial: (dims.z / 2) | 0, sagittal: (dims.x / 2) | 0, coronal: (dims.y / 2) | 0 },
      window: win,
      tool: 'contour',
      brushRadius: 1,
      activeLabelId: null,
      selectedDefectId: null,
      candidate: null,
      autoRotate: true,
    };
    this.reconstruction = this.runReconstruct();
    saveDoc(this.history);
    saveUI(this.ui);
    this.emit();
  }

  // ---------- 标签 ----------
  addLabel(name?: string): string {
    const id = nextId('label');
    const n = this.doc.labels.length;
    const label: DefectLabel = {
      id,
      name: name ?? `缺陷 ${n + 1}`,
      color: LABEL_COLORS[n % LABEL_COLORS.length],
    };
    this.commit({ labels: [...this.doc.labels, label], adoptions: this.doc.adoptions });
    this.patchUI({ activeLabelId: id });
    return id;
  }

  renameLabel(id: string, name: string) {
    this.commit({
      labels: this.doc.labels.map((l) => (l.id === id ? { ...l, name } : l)),
      adoptions: this.doc.adoptions,
    });
  }

  deleteLabel(id: string) {
    this.commit({
      labels: this.doc.labels.filter((l) => l.id !== id),
      adoptions: this.doc.adoptions.filter((a) => a.defectLabelId !== id),
    });
    if (this.ui.activeLabelId === id) this.patchUI({ activeLabelId: null });
  }

  // ---------- 编辑 ----------
  private pushAdoption(a: Omit<Adoption, 'id'>) {
    this.commit({
      labels: this.doc.labels,
      adoptions: [...this.doc.adoptions, { ...a, id: nextId('adopt') }],
    });
  }

  /** 采用当前候选轮廓（未闭合也可采用，但会触发门禁阻止定量） */
  adoptCandidate() {
    const c = this.ui.candidate;
    if (!c || !this.ui.activeLabelId) return;
    this.pushAdoption({
      op: 'defect-add',
      defectLabelId: this.ui.activeLabelId,
      view: c.view,
      depth: c.depth,
      points: c.points,
      closed: c.closed,
    });
    this.patchUI({ candidate: null });
  }

  cancelCandidate() {
    this.patchUI({ candidate: null }, false);
  }

  updateCandidate(c: CandidateContour | null) {
    this.patchUI({ candidate: c }, false);
  }

  /** 一笔刷操作结束（抬起）时提交，保证一次笔画是一个可撤销单元 */
  commitStroke(op: Adoption['op'], view: ViewId, depth: number, voxels: number[]) {
    if (voxels.length === 0) return;
    const isDefect = op === 'defect-add' || op === 'defect-erase';
    if (isDefect && !this.ui.activeLabelId && op === 'defect-add') return;
    this.pushAdoption({
      op,
      defectLabelId: isDefect ? this.ui.activeLabelId ?? undefined : undefined,
      view,
      depth,
      points: [],
      closed: true,
      explicitVoxels: [...new Set(voxels)].sort((a, b) => a - b),
    });
  }

  undo() {
    this.history.undo();
    this.replaceHistoryPoint();
  }
  redo() {
    this.history.redo();
    this.replaceHistoryPoint();
  }

  clearAllEdits() {
    this.commit(emptyDoc());
    this.patchUI({ activeLabelId: null, selectedDefectId: null, candidate: null });
  }

  /** 一键写入内置模拟件的标准答案标记（表面 + 相邻气孔 + 裂纹），便于首屏演示 */
  seedDemoMarks() {
    const t = this.dataset.truth;
    if (!t) return;
    const labels: DefectLabel[] = [
      { id: 'seed-pore-a', name: '气孔 A', color: LABEL_COLORS[0] },
      { id: 'seed-pore-b', name: '气孔 B', color: LABEL_COLORS[1] },
      { id: 'seed-crack', name: '近表面裂纹', color: LABEL_COLORS[3] },
    ];
    const mk = (
      id: string,
      op: Adoption['op'],
      labelId: string | undefined,
      voxels: number[],
    ): Adoption => ({
      id,
      op,
      defectLabelId: labelId,
      view: 'axial',
      depth: 0,
      points: [],
      closed: true,
      explicitVoxels: voxels,
    });
    const adoptions: Adoption[] = [
      mk('seed-surface', 'surface-add', undefined, t.surface),
      mk('seed-a', 'defect-add', labels[0].id, t.poreA),
      mk('seed-b', 'defect-add', labels[1].id, t.poreB),
      mk('seed-c', 'defect-add', labels[2].id, t.crack),
    ];
    this.commit({ labels, adoptions });
    this.patchUI({ activeLabelId: labels[0].id });
  }

  // ---------- 视图联动 ----------
  setCursor(v: Vec3) {
    const dims = this.dataset.volume.meta.dims;
    const clamped: Vec3 = {
      x: Math.max(0, Math.min(dims.x - 1, Math.round(v.x))),
      y: Math.max(0, Math.min(dims.y - 1, Math.round(v.y))),
      z: Math.max(0, Math.min(dims.z - 1, Math.round(v.z))),
    };
    this.patchUI(
      {
        cursor: clamped,
        depths: { axial: clamped.z, sagittal: clamped.x, coronal: clamped.y },
      },
      false,
    );
  }

  setDepth(view: ViewId, depth: number) {
    const dims = this.dataset.volume.meta.dims;
    const axis = view === 'axial' ? 'z' : view === 'sagittal' ? 'x' : 'y';
    const max = dims[axis] - 1;
    const d = Math.max(0, Math.min(max, depth));
    const cursor = { ...this.ui.cursor, [axis]: d };
    const depths = { ...this.ui.depths, [view]: d };
    this.patchUI({ cursor, depths }, false);
  }

  selectDefect(id: string | null) {
    this.patchUI({ selectedDefectId: id }, false);
  }

  // ---------- 其他 UI ----------
  setTool(tool: ToolId) {
    this.patchUI({ tool, candidate: tool === 'contour' ? this.ui.candidate : null });
  }
  setBrushRadius(r: number) {
    this.patchUI({ brushRadius: Math.max(0, Math.min(6, r)) }, false);
  }
  setActiveLabel(id: string) {
    this.patchUI({ activeLabelId: id }, false);
  }
  setWindow(w: WindowLevel) {
    this.patchUI({ window: w }, false);
  }
  setAutoRotate(v: boolean) {
    this.patchUI({ autoRotate: v }, false);
  }

  /** 点选缺陷后，三视图跳到其质心 */
  focusDefect(id: string) {
    const d = this.reconstruction.defects.find((x) => x.id === id);
    if (!d || d.voxels.length === 0) return;
    const c = d.measurement?.centroidVoxel ?? fromLinear(d.voxels[(d.voxels.length / 2) | 0], this.dataset.volume.meta.dims);
    this.setCursor(c);
    this.selectDefect(id);
  }
}
