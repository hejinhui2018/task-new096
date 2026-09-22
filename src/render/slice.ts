// 截面上采样灰度并应用窗宽窗位，生成可绘制的 ImageData
import type { Dims } from '../domain/coordinates';
import type { SliceImage, WindowLevel } from '../domain/types';

export interface SliceSampler {
  /** z 层 → 切片数据（Map，缺层不在其中） */
  byZ: Map<number, SliceImage>;
}

export function buildSampler(slices: SliceImage[]): SliceSampler {
  return { byZ: new Map(slices.map((s) => [s.z, s])) };
}

function sampleGray(view: 'axial' | 'sagittal' | 'coronal', depth: number, a: number, b: number, sampler: SliceSampler, dims: Dims): number | null {
  let x: number;
  let y: number;
  let z: number;
  if (view === 'axial') {
    x = a;
    y = b;
    z = depth;
  } else if (view === 'sagittal') {
    y = a;
    z = b;
    x = depth;
  } else {
    x = a;
    z = b;
    y = depth;
  }
  const slice = sampler.byZ.get(z);
  if (!slice) return null; // 缺层
  return slice.data[y * dims.x + x] as number;
}

/**
 * 光栅化某视图某深度截面：返回 RGBA ImageData。
 * 缺层返回 null（调用方绘制缺失提示）。
 */
export function renderPlane(
  view: 'axial' | 'sagittal' | 'coronal',
  depth: number,
  sampler: SliceSampler,
  dims: Dims,
  win: WindowLevel,
): ImageData | null {
  if (view === 'axial' && !sampler.byZ.has(depth)) return null;
  const width = view === 'sagittal' ? dims.y : dims.x;
  const height = view === 'sagittal' ? dims.z : view === 'coronal' ? dims.z : dims.y;
  const img = new ImageData(width, height);
  const lo = win.center - win.width / 2;
  const hi = win.center + win.width / 2;
  const span = Math.max(1e-9, hi - lo);
  for (let b = 0; b < height; b++) {
    for (let a = 0; a < width; a++) {
      const g = sampleGray(view, depth, a, b, sampler, dims);
      const o = (b * width + a) * 4;
      if (g === null) {
        img.data[o] = 40;
        img.data[o + 1] = 10;
        img.data[o + 2] = 10;
        img.data[o + 3] = 255;
        continue;
      }
      const t = Math.max(0, Math.min(1, (g - lo) / span));
      const v = Math.round(t * 255);
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  return img;
}

export function planeDims(view: 'axial' | 'sagittal' | 'coronal', dims: Dims) {
  return {
    width: view === 'sagittal' ? dims.y : dims.x,
    height: view === 'sagittal' ? dims.z : view === 'coronal' ? dims.z : dims.y,
  };
}
