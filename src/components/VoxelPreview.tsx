/**
 * 体素预览：缺陷（及外表面）体素的三维点云，拖拽旋转。
 * 轻量实现：Canvas 2D 投影 + 深度排序，无 WebGL 依赖。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

const MAX_DEFECT_PTS = 20000;
const MAX_SURFACE_PTS = 4000;

export function VoxelPreview() {
  const { state, derived } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rot, setRot] = useState({ yaw: 0.7, pitch: -0.5 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.volume) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = (canvas.width = 340);
    const H = (canvas.height = 280);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, W, H);

    const dims = state.volume.meta.dims;
    const cx = dims[0] / 2, cy = dims[1] / 2, cz = dims[2] / 2;
    const scale = Math.min(W, H) / Math.max(dims[0], dims[1], dims[2]) * 0.8;
    const sy = Math.sin(rot.yaw), cyw = Math.cos(rot.yaw);
    const sp = Math.sin(rot.pitch), cp = Math.cos(rot.pitch);

    const project = (x: number, y: number, z: number): [number, number, number] => {
      let px = x - cx, py = y - cy, pz = z - cz;
      // yaw (绕 z) 再 pitch (绕 x')
      const x1 = px * cyw - py * sy;
      const y1 = px * sy + py * cyw;
      const y2 = y1 * cp - pz * sp;
      const z2 = y1 * sp + pz * cp;
      return [W / 2 + x1 * scale, H / 2 + y2 * scale, z2];
    };

    const plot = (mask: Uint8Array, color: string, maxPts: number, size: number) => {
      const pts: Array<[number, number, number]> = [];
      const total = mask.reduce((a, b) => a + (b ? 1 : 0), 0);
      const stride = Math.max(1, Math.floor(total / maxPts));
      let k = 0;
      for (let z = 0; z < dims[2]; z++)
        for (let y = 0; y < dims[1]; y++)
          for (let x = 0; x < dims[0]; x++) {
            const i = x + dims[0] * (y + dims[1] * z);
            if (!mask[i]) continue;
            if (k++ % stride !== 0) continue;
            pts.push(project(x, y, z));
          }
      pts.sort((a, b) => a[2] - b[2]);
      ctx.fillStyle = color;
      for (const [px, py] of pts) ctx.fillRect(px - size / 2, py - size / 2, size, size);
    };

    if (derived.surfaceVoxelCount > 0) plot(derived.surfaceMask, 'rgba(63, 214, 143, 0.25)', MAX_SURFACE_PTS, 1);

    // 缺陷：选中的高亮，其余暗红
    const sel = state.selectedDefect;
    for (const d of derived.defects) {
      const mask = new Uint8Array(state.volume.meta.dims[0] * state.volume.meta.dims[1] * state.volume.meta.dims[2]);
      for (const i of d.voxels) mask[i] = 1;
      plot(mask, sel === d.id ? 'rgba(255, 176, 32, 0.95)' : 'rgba(255, 90, 60, 0.55)', MAX_DEFECT_PTS, sel === d.id ? 2.5 : 2);
    }

    ctx.fillStyle = '#9aa4b0';
    ctx.font = '11px sans-serif';
    ctx.fillText('体素预览（拖拽旋转）· 绿=外表面 橙=选中缺陷', 8, H - 8);
  }, [state.volume, state.selectedDefect, derived, rot]);

  useEffect(draw, [draw]);

  return (
    <div className="panel voxel-preview">
      <h3>体素预览</h3>
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; }}
        onMouseMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setRot((r) => ({ yaw: r.yaw + dx * 0.01, pitch: Math.max(-1.5, Math.min(1.5, r.pitch + dy * 0.01)) }));
        }}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; }}
      />
    </div>
  );
}
