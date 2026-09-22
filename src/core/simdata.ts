/**
 * 内置模拟数据：航空铸件方块（圆柱形零件）+ 两个相邻气孔 + 一条近表面裂纹。
 * 变体 A：完整数据（可给出定量结论）；变体 B：缺一层（触发缺层门禁）。
 * 生成完全确定（固定种子 LCG），便于持久化后按 id 重建。
 */
import type { Volume } from './types';

export const SIM_DIMS: [number, number, number] = [64, 64, 48];
export const SIM_SPACING: [number, number, number] = [0.5, 0.5, 0.8]; // mm
export const SIM_ORIGIN: [number, number, number] = [0, 0, 0];

export const SIM_SOURCE_COMPLETE = 'sim-complete';
export const SIM_SOURCE_MISSING = 'sim-missing-slice';

/** 模拟缺陷的真值描述（供 UI 展示与测试参考） */
export const SIM_TRUTH = {
  poreA: { center: [25, 30, 20] as const, radius: 2.5 },
  poreB: { center: [32, 30, 20] as const, radius: 2.5 },
  crack: { center: [32, 15, 32] as const, semi: [1, 5, 1] as const },
  part: { axis: [32, 32] as const, radius: 20, zMin: 4, zMax: 43 },
  missingSliceZ: 24,
};

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateSimVolume(sourceId: string): Volume {
  const [nx, ny, nz] = SIM_DIMS;
  const data = new Uint16Array(nx * ny * nz);
  const rand = lcg(20260920);
  const { poreA, poreB, crack, part } = SIM_TRUTH;

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = x + nx * (y + ny * z);
        const noise = (rand() - 0.5) * 40;
        let v = 100 + noise; // 背景（空气/夹具）
        const inPart =
          z >= part.zMin && z <= part.zMax &&
          (x - part.axis[0]) ** 2 + (y - part.axis[1]) ** 2 <= part.radius ** 2;
        if (inPart) v = 900 + noise;
        // 缺陷写为低密度孔洞
        const dA = Math.hypot(x - poreA.center[0], y - poreA.center[1], z - poreA.center[2]);
        const dB = Math.hypot(x - poreB.center[0], y - poreB.center[1], z - poreB.center[2]);
        if (inPart && (dA <= poreA.radius || dB <= poreB.radius)) v = 250 + noise;
        const dc =
          ((x - crack.center[0]) / crack.semi[0]) ** 2 +
          ((y - crack.center[1]) / crack.semi[1]) ** 2 +
          ((z - crack.center[2]) / crack.semi[2]) ** 2;
        if (inPart && dc <= 1) v = 200 + noise;
        data[i] = Math.max(0, Math.round(v));
      }
    }
  }

  const presentSlices = new Array(nz).fill(true);
  if (sourceId === SIM_SOURCE_MISSING) {
    const mz = SIM_TRUTH.missingSliceZ;
    presentSlices[mz] = false;
    // 缺层数据清零，模拟未采集
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) data[x + nx * (y + ny * mz)] = 0;
  }

  return {
    meta: {
      dims: [nx, ny, nz],
      spacing: [...SIM_SPACING],
      origin: [...SIM_ORIGIN],
      orientation: 'RAS',
    },
    data,
    presentSlices,
    conflicts: [],
    sourceId,
  };
}
