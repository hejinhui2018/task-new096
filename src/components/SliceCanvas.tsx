/**
 * 单正交视图：灰度切片（窗宽窗位映射）+ 掩膜着色 + 轮廓/候选轮廓叠加 + 十字光标。
 * 交互：左键按当前工具（定位/勾画/擦除），右键拖拽调窗，滚轮翻层。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Plane } from '../core/types';
import { planeDims, viewToVoxel, voxelToView } from '../core/coords';
import { useStore } from '../state/store';

const PLANE_TITLE: Record<Plane, string> = {
  axial: '横断面 Axial (z)',
  coronal: '冠状面 Coronal (y)',
  sagittal: '矢状面 Sagittal (x)',
};

const DISPLAY_W = 300;

export function SliceCanvas({ plane }: { plane: Plane }) {
  const { state, dispatch, derived } = useStore();
  const { volume, wl, slices, cursor, tool, candidate } = state;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ u: number; v: number; gray: number } | null>(null);
  const wlDrag = useRef<{ x: number; y: number; w: number; c: number } | null>(null);

  const dims = volume?.meta.dims ?? ([1, 1, 1] as [number, number, number]);
  const { nu, nv, slices: nSlices } = planeDims(dims, plane);
  const scale = Math.max(1, Math.floor(DISPLAY_W / nu));
  const slice = Math.min(slices[plane], nSlices - 1);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !volume) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = nu * scale;
    const h = nv * scale;
    canvas.width = w;
    canvas.height = h;

    // 1) 灰度底图（窗宽窗位）
    const img = ctx.createImageData(nu, nv);
    const lo = wl.c - wl.w / 2;
    const missing = plane === 'axial' && !volume.presentSlices[slice];
    for (let v = 0; v < nv; v++) {
      for (let u = 0; u < nu; u++) {
        const [x, y, z] = viewToVoxel(plane, slice, u, v);
        const idx = x + dims[0] * (y + dims[1] * z);
        const g = volume.data[idx];
        let t = ((g - lo) / wl.w) * 255;
        t = t < 0 ? 0 : t > 255 ? 255 : t;
        let r = t, gg = t, b = t;
        if (derived.surfaceMask[idx]) { r = t * 0.3; gg = Math.min(255, t * 0.6 + 110); b = t * 0.3; }
        if (derived.defectMask[idx]) { r = Math.min(255, t * 0.5 + 170); gg = t * 0.4; b = t * 0.3; }
        const o = (v * nu + u) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    const off = document.createElement('canvas');
    off.width = nu; off.height = nv;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, w, h);

    // 缺层警示
    if (missing) {
      ctx.fillStyle = 'rgba(180, 30, 30, 0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('缺层（未采集）', 8, 20);
    }

    // 2) 已提交轮廓
    for (const c of state.contoursHist.present) {
      if (c.plane !== plane || c.sliceIndex !== slice) continue;
      ctx.beginPath();
      c.points.forEach(([u, v], i) => {
        const px = (u + 0.5) * scale, py = (v + 0.5) * scale;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      if (c.closed) ctx.closePath();
      ctx.strokeStyle = c.kind === 'defect' ? (c.closed ? '#ffb020' : '#ff5555') : '#3fd68f';
      ctx.lineWidth = 1.5;
      ctx.setLineDash(c.closed ? [] : [4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3) 候选轮廓预览
    if (candidate && candidate.plane === plane && candidate.sliceIndex === slice) {
      ctx.beginPath();
      candidate.points.forEach(([u, v], i) => {
        const px = (u + 0.5) * scale, py = (v + 0.5) * scale;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      if (candidate.closed) ctx.closePath();
      ctx.strokeStyle = candidate.closed ? '#4da3ff' : '#8ec7ff';
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      if (candidate.closed) {
        ctx.fillStyle = 'rgba(77, 163, 255, 0.15)';
        ctx.fill();
      }
      // 顶点
      ctx.fillStyle = '#8ec7ff';
      candidate.points.forEach(([u, v]) => {
        ctx.fillRect((u + 0.5) * scale - 2, (v + 0.5) * scale - 2, 4, 4);
      });
    }

    // 4) 十字光标（三视图联动同一点）
    if (cursor) {
      const cv = voxelToView(plane, cursor);
      if (cv.sliceIndex === slice) {
        const px = (cv.u + 0.5) * scale;
        const py = (cv.v + 0.5) * scale;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, py); ctx.lineTo(w, py);
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
        ctx.stroke();
      }
    }
  }, [volume, plane, slice, wl, nu, nv, scale, dims, derived, state.contoursHist, candidate, cursor]);

  useEffect(draw, [draw]);

  if (!volume) return <div className="slice-canvas empty">请先载入数据</div>;

  const toUV = (e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const u = Math.floor((e.clientX - rect.left) / scale);
    const v = Math.floor((e.clientY - rect.top) / scale);
    return [Math.max(0, Math.min(nu - 1, u)), Math.max(0, Math.min(nv - 1, v))];
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      wlDrag.current = { x: e.clientX, y: e.clientY, w: wl.w, c: wl.c };
      return;
    }
    if (e.button !== 0) return;
    const [u, v] = toUV(e);
    if (tool === 'crosshair') {
      dispatch({ type: 'SET_CURSOR', voxel: viewToVoxel(plane, slice, u, v) });
    } else if (tool === 'draw-defect' || tool === 'draw-surface') {
      dispatch({
        type: 'CANDIDATE_POINT',
        plane,
        sliceIndex: slice,
        kind: tool === 'draw-defect' ? 'defect' : 'surface',
        u,
        v,
      });
    } else if (tool === 'erase') {
      // 命中本层轮廓则删除
      for (const c of state.contoursHist.present) {
        if (c.plane !== plane || c.sliceIndex !== slice) continue;
        // 简单命中：点落在轮廓包围盒内即候选，再精确到多边形
        const us = c.points.map((p) => p[0]);
        const vs = c.points.map((p) => p[1]);
        if (u >= Math.min(...us) - 1 && u <= Math.max(...us) + 1 && v >= Math.min(...vs) - 1 && v <= Math.max(...vs) + 1) {
          dispatch({ type: 'DELETE_CONTOUR', id: c.id });
          return;
        }
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (wlDrag.current) {
      const dx = e.clientX - wlDrag.current.x;
      const dy = e.clientY - wlDrag.current.y;
      dispatch({
        type: 'SET_WL',
        wl: {
          w: Math.max(1, wlDrag.current.w + dx * 4),
          c: wlDrag.current.c + dy * 4,
        },
      });
      return;
    }
    const [u, v] = toUV(e);
    const [x, y, z] = viewToVoxel(plane, slice, u, v);
    const gray = volume.data[x + dims[0] * (y + dims[1] * z)];
    setHover({ u, v, gray });
  };

  const onMouseUp = () => { wlDrag.current = null; };

  return (
    <div className="slice-canvas">
      <div className="slice-head">
        <span>{PLANE_TITLE[plane]}</span>
        <span className="slice-pos">{slice + 1}/{nSlices}</span>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { setHover(null); wlDrag.current = null; }}
        onWheel={(e) => {
          e.preventDefault();
          dispatch({ type: 'SET_SLICE', plane, index: slice + (e.deltaY > 0 ? 1 : -1) });
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <input
        type="range"
        min={0}
        max={nSlices - 1}
        value={slice}
        onChange={(e) => dispatch({ type: 'SET_SLICE', plane, index: Number(e.target.value) })}
      />
      <div className="slice-status">
        {hover
          ? `(${hover.u}, ${hover.v}) 灰度 ${hover.gray}`
          : '左键按工具操作 · 右键拖拽调窗 · 滚轮翻层'}
      </div>
    </div>
  );
}
