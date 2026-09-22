import { useEffect, useRef } from 'react';
import { fromLinear, type Dims } from '../domain/coordinates';
import { useStore, useStoreVersion } from '../state/context';

/** 体素预览：旋转正交投影绘制表面壳（青）与各缺陷（标签色），选中缺陷高亮。 */
export function VoxelPreview() {
  const store = useStore();
  useStoreVersion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0.6);
  const tiltRef = useRef(0.5);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dims = store.dataset.volume.meta.dims as Dims;
    const colorById = new Map(store.doc.labels.map((l) => [l.id, l.color]));

    let raf = 0;
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = '#0e1116';
      ctx.fillRect(0, 0, W, H);

      const angle = angleRef.current;
      const tilt = tiltRef.current;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);

      // 归一化坐标（以体素为单位，居中），再做 y 旋转 + x 倾斜
      const cx = dims.x / 2;
      const cy = dims.y / 2;
      const cz = dims.z / 2;
      const project = (x: number, y: number, z: number) => {
        const px = x - cx;
        const py = y - cy;
        const pz = z - cz;
        const rx = ca * px - sa * py;
        const ry = sa * px + ca * py;
        const rz = ct * pz - st * ry;
        const depth = st * pz + ct * ry;
        const scale = Math.min(W / (dims.x + 4), H / (dims.y + dims.z + 6)) * 1.35;
        return { sx: W / 2 + rx * scale, sy: H / 2 + rz * scale, depth };
      };

      type Cell = { sx: number; sy: number; depth: number; color: string; alpha: number; size: number };
      const cells: Cell[] = [];

      const selected = store.reconstruction.defects.find((d) => d.id === store.ui.selectedDefectId);
      const selectedSet = selected ? new Set(selected.voxels) : null;
      const defectColor = new Map<number, string>();
      for (const d of store.reconstruction.defects) {
        const color = d.labelIds.map((id) => colorById.get(id)).find(Boolean) ?? '#ff5d5d';
        for (const v of d.voxels) defectColor.set(v, color);
      }

      const surface = store.reconstruction.surfaceVoxels;
      for (let i = 0; i < surface.length; i += 1) {
        const v = surface[i];
        const p = fromLinear(v, dims);
        const pr = project(p.x, p.y, p.z);
        cells.push({ ...pr, color: '#39e6ff', alpha: 0.16, size: 1.5 });
      }
      for (const [v, color] of defectColor) {
        const p = fromLinear(v, dims);
        const pr = project(p.x, p.y, p.z);
        const isSel = selectedSet?.has(v);
        cells.push({ ...pr, color: isSel ? '#ffe95c' : color, alpha: isSel ? 1 : 0.9, size: isSel ? 3.4 : 2.4 });
      }

      // 画家算法：远的先画
      cells.sort((a, b) => a.depth - b.depth);
      for (const c of cells) {
        ctx.globalAlpha = c.alpha;
        ctx.fillStyle = c.color;
        ctx.fillRect(c.sx - c.size / 2, c.sy - c.size / 2, c.size, c.size);
      }
      ctx.globalAlpha = 1;

      // 表面最短距离证据连线
      if (selected?.measurement?.surfacePair) {
        const a = project(
          selected.measurement.surfacePair.defect.x,
          selected.measurement.surfacePair.defect.y,
          selected.measurement.surfacePair.defect.z,
        );
        const b = project(
          selected.measurement.surfacePair.surface.x,
          selected.measurement.surfacePair.surface.y,
          selected.measurement.surfacePair.surface.z,
        );
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (store.ui.autoRotate && !draggingRef.current) {
        angleRef.current += 0.006;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={300}
      className="preview-canvas"
      onPointerDown={(e) => {
        draggingRef.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        angleRef.current += (e.clientX - draggingRef.current.x) * 0.01;
        tiltRef.current = Math.max(-1.2, Math.min(1.2, tiltRef.current + (e.clientY - draggingRef.current.y) * 0.01));
        draggingRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        draggingRef.current = null;
      }}
    />
  );
}
