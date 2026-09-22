/**
 * 轮廓（多边形）→ 体素掩膜的栅格化，以及闭合性校验。
 * 视图逻辑坐标 (u,v) 下的多边形，填充体素中心落在多边形内（含边界）的体素。
 */
import type { Contour } from './types';
import { planeSliceIndices } from './coords';

/** 闭合性：至少 3 个顶点且显式标记 closed */
export function isClosedContour(points: Array<[number, number]>, closed: boolean): boolean {
  return closed && points.length >= 3;
}

/** 射线法点-in-多边形（含边界容差） */
export function pointInPolygon(
  u: number,
  v: number,
  poly: Array<[number, number]>,
): boolean {
  const n = poly.length;
  if (n < 3) return false;
  // 边界容差：点到任一线段距离 < 0.5 体素视为在内
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (distToSegment(u, v, poly[j], poly[i]) < 0.5) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(
  px: number,
  py: number,
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * 把一组轮廓栅格化到体掩膜（原地写入，值置 1）。
 * 仅闭合轮廓会被栅格化；未闭合轮廓由门禁拦截，不应到达这里（防御性跳过）。
 */
export function rasterizeContours(
  contours: Contour[],
  dims: [number, number, number],
  mask: Uint8Array,
  kind: Contour['kind'],
): void {
  for (const c of contours) {
    if (c.kind !== kind) continue;
    if (!isClosedContour(c.points, c.closed)) continue;
    const { nu, nv, indexOf } = planeSliceIndices(dims, c.plane, c.sliceIndex);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [u, v] of c.points) {
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const u0 = Math.max(0, Math.floor(minU - 1));
    const u1 = Math.min(nu - 1, Math.ceil(maxU + 1));
    const v0 = Math.max(0, Math.floor(minV - 1));
    const v1 = Math.min(nv - 1, Math.ceil(maxV + 1));
    for (let vv = v0; vv <= v1; vv++) {
      for (let uu = u0; uu <= u1; uu++) {
        // 体素中心 (uu+0.5, vv+0.5)
        if (pointInPolygon(uu + 0.5, vv + 0.5, c.points)) {
          mask[indexOf(uu, vv)] = 1;
        }
      }
    }
  }
}
