import { useState } from 'react';
import { useStore } from '../state/store';

const EXAMPLE = `{
  "kind": "ct-slice-manifest",
  "version": 1,
  "width": 64, "height": 64,
  "spacing": [0.5, 0.5, 0.8],
  "origin": [0, 0, 0],
  "orientation": "RAS",
  "slices": [
    { "index": 0, "bits": 16, "data": "<base64>" }
  ]
}`;

/** 导入切片清单对话框：粘贴 JSON 或选择文件 */
export function ImportDialog() {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');

  if (!state.importOpen) return null;

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(f);
  };

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'SET_IMPORT_OPEN', open: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>导入切片清单（JSON manifest）</h3>
        <p className="muted">
          清单需含体素间距 spacing、原点 origin、方向 orientation 与逐片 base64 灰度数据。
          缺层与逐片元数据冲突会触发门禁并阻止定量结论。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          rows={10}
        />
        <div className="modal-actions">
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            className="primary"
            disabled={!text.trim()}
            onClick={() => dispatch({ type: 'LOAD_IMPORT', json: text })}
          >
            导入
          </button>
          <button onClick={() => dispatch({ type: 'SET_IMPORT_OPEN', open: false })}>关闭</button>
        </div>
        {state.importError && <div className="import-error">导入失败：{state.importError}</div>}
      </div>
    </div>
  );
}
