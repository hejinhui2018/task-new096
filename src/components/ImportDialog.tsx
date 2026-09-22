import { useState } from 'react';
import {
  assembleVolume,
  EXAMPLE_MANIFEST,
  parseManifestText,
  type LoadedFile,
  type SliceManifest,
} from '../domain/manifest';
import { useStore } from '../state/context';
import type { Dataset } from '../state/store';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [manifestText, setManifestText] = useState('');
  const [rawFiles, setRawFiles] = useState<LoadedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onManifestFile = async (f: File | undefined) => {
    if (!f) return;
    setManifestText(await f.text());
    setErrors([]);
  };

  const onRawFiles = async (files: FileList | null) => {
    if (!files) return;
    const out: LoadedFile[] = [];
    for (const f of Array.from(files)) {
      out.push({ name: f.name, bytes: await f.arrayBuffer() });
    }
    setRawFiles(out);
  };

  const doImport = async () => {
    setErrors([]);
    const parsed = parseManifestText(manifestText);
    if (parsed.errors.length > 0 || !parsed.meta) {
      setErrors(parsed.errors);
      return;
    }
    let manifest: SliceManifest;
    try {
      manifest = JSON.parse(manifestText) as SliceManifest;
    } catch (e) {
      setErrors([(e as Error).message]);
      return;
    }
    setBusy(true);
    // 让 UI 先刷新到 busy 态
    await new Promise((r) => setTimeout(r, 10));
    const result = assembleVolume(manifest, rawFiles);
    setBusy(false);
    if (result.errors.length > 0 || !result.meta || !result.slices) {
      setErrors(result.errors);
      return;
    }
    const id = `imported-${Date.now().toString(36)}`;
    const ds: Dataset = {
      id,
      name: manifest.name ?? '导入体数据',
      description: `用户导入 ${result.slices.length} 张切片`,
      builtin: false,
      volume: { meta: result.meta, slices: result.slices },
      presentZs: result.slices.map((s) => s.z),
    };
    store.registerCustomDataset(ds);
    store.loadDataset(id);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>导入灰度切片清单</h3>
        <p className="muted">
          选择一个 JSON 清单（含 dims/spacing/origin/direction/dtype/slices）与全部原始切片文件。
          切片缺失、z 越界/重复、方向元数据冲突或字节数不符都会被拒绝或触发定量门禁。
        </p>
        <label className="file-row">
          清单 JSON：
          <input type="file" accept=".json,application/json" onChange={(e) => void onManifestFile(e.target.files?.[0])} />
        </label>
        <label className="file-row">
          原始切片（.raw，可多选）：当前 {rawFiles.length} 个文件
          <input type="file" accept=".raw,.bin" multiple onChange={(e) => void onRawFiles(e.target.files)} />
        </label>
        <textarea
          className="manifest-edit"
          rows={10}
          value={manifestText}
          placeholder={EXAMPLE_MANIFEST}
          onChange={(e) => setManifestText(e.target.value)}
        />
        {errors.length > 0 && (
          <ul className="error-list">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={busy || !manifestText} onClick={() => void doImport()}>
            {busy ? '校验中…' : '校验并导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
