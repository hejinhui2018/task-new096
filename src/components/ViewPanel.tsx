import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planeToVoxel, voxelToPlane, VIEW_LAYOUTS, type Dims } from '../domain/coordinates';
import { brushToVoxels } from '../domain/masks';
import { nearFirstPoint } from '../domain/geometry';
import { buildSampler, planeDims, renderPlane } from '../render/slice';
import type { DefectLabel } from '../state/types';
import { useStore, useStoreVersion } from '../state/context';
import type { PlanePoint, ViewId } from '../domain/types';

const VIEW_TITLES: Record<ViewId, string> = {
  axial: '轴位 AX（XY @ z）',
  sagittal: '矢位 SAG（YZ @ x）',
  coronal: '冠位 COR（XZ @ y）',
};

export function ViewPanel({ view }: { view: ViewId }) {
  const store = useStore();
  useStoreVersion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<PlanePoint | null>(null);
  const [liveVoxels, setLiveVoxels] = useState<Set<number>>(new Set());

  /** 一次拖拽笔刷的缓存，抬笔时一次性提交为单条可撤销记录 */
  const pendingStroke = useRef<{ op: string; voxels: Set<number> } | null>(null);

  const { dataset, ui } = store;
  const dims = dataset.volume.meta.dims as Dims;
  const depth = ui.depths[view];
  const { width, height } = planeDims(view, dims);
  const layout = VIEW_LAYOUTS[view];

  const sampler = useMemo(() => buildSampler(dataset.volume.slices), [dataset]);

  // 体素线性索引 → 标签颜色（当前深度外的也无妨，查询时按层过滤）
  const voxelColor = useMemo(() => {
    const m = new Map<number, string>();
    const colorById = new Map(store.doc.labels.map((l: DefectLabel) => [l.id, l.color]));
    for (const d of store.reconstruction.defects) {
      const color = d.labelIds.map((id) => colorById.get(id)).find(Boolean) ?? '#ff5d5d';
      for (const v of d.voxels) m.set(v, color);
    }
    return m;
  }, [store.doc.labels, store.reconstruction]);

  const surfaceSet = useMemo(
    () => new Set(store.reconstruction.surfaceVoxels),
    [store.reconstruction],
  );

  const missing = view === 'axial' && !sampler.byZ.has(depth);

  // ---------- 绘制 ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const img = missing
      ? null
      : renderPlane(view, depth, sampler, dims, ui.window);
    if (img) ctx.putImageData(img, 0, 0);
    else {
      ctx.fillStyle = '#2a0d0d';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ff8a8a';
      ctx.font = `${Math.max(8, Math.floor(width / 12))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`切片 z=${depth} 缺失`, width / 2, height / 2);
    }

    const li = (x: number, y: number, z: number) => (z * dims.y + y) * dims.x + x;
    // 掩膜叠加
    for (let b = 0; b < height; b++) {
      for (let a = 0; a < width; a++) {
        const v = planeToVoxel(view, { a, b }, depth);
        const idx = li(v.x, v.y, v.z);
        const color = voxelColor.get(idx);
        if (color) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.62;
          ctx.fillRect(a, b, 1, 1);
          ctx.globalAlpha = 1;
        } else if (surfaceSet.has(idx)) {
          ctx.fillStyle = '#39e6ff';
          ctx.globalAlpha = 0.5;
          ctx.fillRect(a, b, 1, 1);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 选中缺陷高亮描边
    const selected = store.reconstruction.defects.find((d) => d.id === ui.selectedDefectId);
    if (selected) {
      const set = new Set(selected.voxels);
      ctx.strokeStyle = '#ffe95c';
      ctx.lineWidth = 0.12;
      for (let b = 0; b < height; b++) {
        for (let a = 0; a < width; a++) {
          const v = planeToVoxel(view, { a, b }, depth);
          if (set.has(li(v.x, v.y, v.z))) {
            ctx.strokeRect(a + 0.08, b + 0.08, 0.84, 0.84);
          }
        }
      }
    }

    // 拖拽中的笔刷实时叠加（尚未提交）
    if (liveVoxels.size > 0) {
      const liveColor =
        ui.tool === 'surface-brush' ? '#39e6ff'
        : ui.tool === 'surface-erase' ? '#223036'
        : ui.tool === 'defect-erase' ? '#1a1a1a'
        : store.doc.labels.find((l) => l.id === ui.activeLabelId)?.color ?? '#ff5d5d';
      ctx.fillStyle = liveColor;
      ctx.globalAlpha = 0.8;
      for (const v of liveVoxels) {
        const vv = {
          x: v % dims.x,
          y: Math.floor(v / dims.x) % dims.y,
          z: Math.floor(v / (dims.x * dims.y)),
        };
        const pp = voxelToPlane(view, vv);
        if (pp.depth === depth) ctx.fillRect(pp.point.a, pp.point.b, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    // 候选轮廓
    const cand = ui.candidate && ui.candidate.view === view && ui.candidate.depth === depth ? ui.candidate : null;
    if (cand && cand.points.length > 0) {
      const drawPath = (close: boolean) => {
        ctx.beginPath();
        ctx.moveTo(cand.points[0].a, cand.points[0].b);
        for (let i = 1; i < cand.points.length; i++) ctx.lineTo(cand.points[i].a, cand.points[i].b);
        if (close) ctx.closePath();
      };
      ctx.strokeStyle = cand.closed ? '#7CFC9A' : '#ffd166';
      ctx.lineWidth = 0.18;
      drawPath(cand.closed);
      ctx.stroke();
      if (!cand.closed && hover && cand.points.length > 0) {
        ctx.strokeStyle = 'rgba(255,209,102,0.55)';
        ctx.beginPath();
        ctx.moveTo(cand.points[cand.points.length - 1].a, cand.points[cand.points.length - 1].b);
        ctx.lineTo(hover.a, hover.b);
        ctx.stroke();
      }
      for (const p of cand.points) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.a - 0.12, p.b - 0.12, 0.24, 0.24);
      }
    }

    // 十字光标
    const pp = voxelToPlane(view, ui.cursor);
    ctx.strokeStyle = 'rgba(120,220,255,0.9)';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(pp.point.a + 0.5, 0);
    ctx.lineTo(pp.point.a + 0.5, height);
    ctx.moveTo(0, pp.point.b + 0.5);
    ctx.lineTo(width, pp.point.b + 0.5);
    ctx.stroke();
  });

  // ---------- 坐标映射 ----------
  const toPlane = useCallback(
    (e: React.PointerEvent | React.MouseEvent): PlanePoint => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const a = ((e.clientX - rect.left) / rect.width) * width;
      const b = ((e.clientY - rect.top) / rect.height) * height;
      return {
        a: Math.max(0, Math.min(width - 1e-6, a)),
        b: Math.max(0, Math.min(height - 1e-6, b)),
      };
    },
    [width, height],
  );

  // 一次拖拽笔刷的缓存（定义见顶部 pendingStroke ref），抬笔时提交为单条可撤销记录

  const onPointerDown = (e: React.PointerEvent) => {
    if (missing) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toPlane(e);
    if (ui.tool === 'navigate') {
      store.setCursor(planeToVoxel(view, p, depth));
      return;
    }
    if (ui.tool === 'contour') {
      const existing =
        ui.candidate && ui.candidate.view === view && ui.candidate.depth === depth ? ui.candidate : null;
      const points = existing ? [...existing.points] : [];
      let closed = existing?.closed ?? false;
      if (points.length >= 3 && nearFirstPoint(points, p, 1.0)) {
        closed = true; // 吸附首点闭合
      } else if (!closed) {
        points.push(p);
      }
      store.updateCandidate({ view, depth, points, closed });
      return;
    }
    // 笔刷类：开始一笔
    const op =
      ui.tool === 'defect-brush'
        ? 'defect-add'
        : ui.tool === 'defect-erase'
          ? 'defect-erase'
          : ui.tool === 'surface-brush'
            ? 'surface-add'
            : 'surface-erase';
    pendingStroke.current = { op, voxels: new Set(brushToVoxels(view, depth, Math.round(p.a), Math.round(p.b), ui.brushRadius, dims)) };
    setLiveVoxels(new Set(pendingStroke.current.voxels));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPlane(e);
    setHover(p);
    if (e.buttons !== 1) return;
    if (missing) return;
    if (ui.tool === 'navigate') {
      store.setCursor(planeToVoxel(view, p, depth));
      return;
    }
    if (pendingStroke.current) {
      const vox = brushToVoxels(view, depth, Math.round(p.a), Math.round(p.b), ui.brushRadius, dims);
      let changed = false;
      for (const v of vox) {
        if (!pendingStroke.current.voxels.has(v)) {
          pendingStroke.current.voxels.add(v);
          changed = true;
        }
      }
      if (changed) setLiveVoxels(new Set(pendingStroke.current.voxels));
    }
  };

  const onPointerUp = () => {
    if (pendingStroke.current) {
      const { op, voxels } = pendingStroke.current;
      pendingStroke.current = null;
      setLiveVoxels(new Set());
      if (voxels.size > 0) {
        store.commitStroke(op as Parameters<typeof store.commitStroke>[0], view, depth, [...voxels]);
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -1 : 1;
    store.setDepth(view, depth + delta);
  };

  const depthAxis = layout.axisDepth;

  return (
    <div className="view-panel">
      <div className="view-head">
        <span className="view-title">{VIEW_TITLES[view]}</span>
        <span className="view-depth">
          {depthAxis} = {depth}
          {missing && <span className="badge badge-danger">缺层</span>}
        </span>
      </div>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="ct-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <input
        className="depth-slider"
        type="range"
        min={0}
        max={dims[depthAxis] - 1}
        value={depth}
        onChange={(e) => store.setDepth(view, Number(e.target.value))}
      />
    </div>
  );
}
