// 灰度切片清单导入：JSON 元数据 + 逐切片原始灰度文件；含全部硬性校验。
import { type Dims, validateDirection } from './coordinates';
import type { SliceImage, VolumeMeta } from './types';

export type SliceDtype = 'uint8' | 'uint16' | 'float32';

/** 清单文件（JSON）结构 */
export interface SliceManifest {
  name?: string;
  dims: { x: number; y: number; z: number };
  spacing: { x: number; y: number; z: number };
  origin: { x: number; y: number; z: number };
  direction?: number[];
  intensityRange?: { min: number; max: number };
  dtype: SliceDtype;
  /** 字节序，默认 little；仅 uint16/float32 需要 */
  endian?: 'little' | 'big';
  slices: { z: number; file: string; name?: string }[];
}

export interface ParseResult {
  meta?: VolumeMeta;
  entries?: { z: number; file: string; name?: string }[];
  errors: string[];
}

const isPosInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n > 0;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 解析并校验清单文本。任何结构性错误都会阻止后续定量。 */
export function parseManifestText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`清单不是合法 JSON：${(e as Error).message}`] };
  }
  return validateManifest(raw);
}

export function validateManifest(raw: unknown): ParseResult {
  const errors: string[] = [];
  const m = raw as Partial<SliceManifest> | null;
  if (!m || typeof m !== 'object') {
    return { errors: ['清单根节点必须是对象'] };
  }

  const dims = m.dims as Dims | undefined;
  if (!dims || !isPosInt(dims.x) || !isPosInt(dims.y) || !isPosInt(dims.z)) {
    errors.push('dims 必须为正整数 {x,y,z}');
  }
  const sp = m.spacing;
  if (!sp || !isNum(sp.x) || !isNum(sp.y) || !isNum(sp.z) || sp.x <= 0 || sp.y <= 0 || sp.z <= 0) {
    errors.push('spacing 必须为正数 {x,y,z}（体素物理间距）');
  }
  const og = m.origin;
  if (!og || !isNum(og.x) || !isNum(og.y) || !isNum(og.z)) {
    errors.push('origin 必须为有限数 {x,y,z}（物理原点 mm）');
  }
  let direction: number[] | undefined;
  if (m.direction !== undefined) {
    if (!Array.isArray(m.direction) || m.direction.length !== 9 || !m.direction.every(isNum)) {
      errors.push('direction 必须为 9 个数字的方向余弦数组');
    } else {
      const check = validateDirection(m.direction);
      if (!check.valid) errors.push(`方向元数据冲突：${check.reason}`);
      direction = m.direction.slice();
    }
  }
  const dtype = m.dtype;
  if (dtype !== 'uint8' && dtype !== 'uint16' && dtype !== 'float32') {
    errors.push(`不支持的 dtype：${String(dtype)}（仅 uint8/uint16/float32）`);
  }

  // 切片条目：z 唯一、范围内
  const entries: { z: number; file: string; name?: string }[] = [];
  const seenZ = new Set<number>();
  if (!Array.isArray(m.slices) || m.slices.length === 0) {
    errors.push('slices 必须为非空数组');
  } else if (dims) {
    for (const [i, s] of m.slices.entries()) {
      if (!s || !isPosInt(s.z) && s.z !== 0) {
        errors.push(`slices[${i}].z 必须为非负整数层号`);
        continue;
      }
      if (s.z < 0 || s.z >= dims.z) {
        errors.push(`slices[${i}].z=${s.z} 超出声明范围 [0, ${dims.z - 1}]`);
        continue;
      }
      if (seenZ.has(s.z)) {
        errors.push(`slices 中 z=${s.z} 重复`);
        continue;
      }
      if (typeof s.file !== 'string' || s.file.length === 0) {
        errors.push(`slices[${i}]（z=${s.z}）缺少 file 文件名`);
        continue;
      }
      seenZ.add(s.z);
      entries.push({ z: s.z, file: s.file, name: s.name });
    }
    // 缺层门禁（清单自身声明了 dims.z，却未列全）
    const missing: number[] = [];
    for (let z = 0; z < dims.z; z++) if (!seenZ.has(z)) missing.push(z);
    if (missing.length > 0) {
      errors.push(`清单缺层：z=${missing.join(', ')}（共 ${missing.length} 层，缺层时禁止定量结论）`);
    }
  }

  if (errors.length > 0 || !dims || !sp || !og) {
    return { errors };
  }

  const range = m.intensityRange ?? { min: 0, max: dtype === 'uint8' ? 255 : 4095 };
  const meta: VolumeMeta = {
    dims: { x: dims.x, y: dims.y, z: dims.z },
    spacing: { x: sp.x, y: sp.y, z: sp.z },
    origin: { x: og.x, y: og.y, z: og.z },
    direction,
    intensityRange: range,
  };
  entries.sort((a, b) => a.z - b.z);
  return { meta, entries, errors: [] };
}

export interface LoadedFile {
  name: string;
  bytes: ArrayBuffer;
}

/** 把原始字节解码成切片灰度数组 */
export function decodeSlice(
  bytes: ArrayBuffer,
  dtype: SliceDtype,
  endian: 'little' | 'big',
): Uint8Array | Uint16Array | Float32Array {
  if (dtype === 'uint8') return new Uint8Array(bytes);
  if (dtype === 'uint16') {
    const arr = new Uint16Array(bytes);
    if (endian === 'big') {
      const dv = new DataView(bytes);
      const out = new Uint16Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = dv.getUint16(i * 2, false);
      return out;
    }
    return arr;
  }
  const arr = new Float32Array(bytes);
  if (endian === 'big') {
    const dv = new DataView(bytes);
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = dv.getFloat32(i * 4, false);
    return out;
  }
  return arr;
}

export interface AssembleResult {
  meta?: VolumeMeta;
  slices?: SliceImage[];
  errors: string[];
}

/**
 * 将清单与用户选择的原始文件组装为体数据。
 * 文件齐全、字节数与维度匹配才成功；文件缺失/长度不符均阻止导入。
 */
export function assembleVolume(
  manifest: SliceManifest,
  files: LoadedFile[],
): AssembleResult {
  const parsed = validateManifest(manifest);
  if (parsed.errors.length > 0 || !parsed.meta || !parsed.entries) {
    return { errors: parsed.errors };
  }
  const byName = new Map(files.map((f) => [f.name, f.bytes]));
  const errors: string[] = [];
  const slices: SliceImage[] = [];
  const expected = parsed.meta.dims.x * parsed.meta.dims.y;
  const bytesPerVoxel = manifest.dtype === 'uint8' ? 1 : manifest.dtype === 'uint16' ? 2 : 4;

  for (const e of parsed.entries) {
    const bytes = byName.get(e.file);
    if (!bytes) {
      errors.push(`缺少切片文件：${e.file}（z=${e.z}）`);
      continue;
    }
    if (bytes.byteLength !== expected * bytesPerVoxel) {
      errors.push(
        `${e.file}（z=${e.z}）字节数 ${bytes.byteLength} 与维度要求 ${expected * bytesPerVoxel} 不符`,
      );
      continue;
    }
    slices.push({
      z: e.z,
      name: e.name ?? e.file,
      data: decodeSlice(bytes, manifest.dtype, manifest.endian ?? 'little'),
    });
  }
  slices.sort((a, b) => a.z - b.z);
  if (errors.length > 0) return { errors };
  return { meta: parsed.meta, slices, errors: [] };
}

/** 示例清单文本（导入对话框中展示，供用户参考格式） */
export const EXAMPLE_MANIFEST = `{
  "name": "demo-casting",
  "dims": { "x": 48, "y": 48, "z": 40 },
  "spacing": { "x": 0.5, "y": 0.5, "z": 0.8 },
  "origin": { "x": -12, "y": -12, "z": 0 },
  "intensityRange": { "min": 0, "max": 2200 },
  "dtype": "uint16",
  "endian": "little",
  "slices": [
    { "z": 0, "file": "slice_000.raw" }
  ]
}`;
