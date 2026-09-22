import { useStore, useStoreVersion } from '../state/context';
import type { ToolId } from '../state/types';

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: 'navigate', label: '定位', hint: '点击/拖拽移动十字光标' },
  { id: 'contour', label: '勾画轮廓', hint: '逐点单击，回到首点吸附闭合；候选需点“采用”' },
  { id: 'defect-brush', label: '缺陷笔', hint: '按住拖拽涂抹缺陷，抬笔提交' },
  { id: 'defect-erase', label: '缺陷擦', hint: '擦除缺陷标记' },
  { id: 'surface-brush', label: '表面笔', hint: '标记零件外表面' },
  { id: 'surface-erase', label: '表面擦', hint: '擦除表面标记' },
];

export function Toolbar({ onOpenImport }: { onOpenImport: () => void }) {
  const store = useStore();
  useStoreVersion();
  const { ui, history } = store;

  return (
    <div className="toolbar">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${ui.tool === t.id ? 'active' : ''}`}
            title={t.hint}
            onClick={() => store.setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="radius-control">
          半径
          <input
            type="range"
            min={0}
            max={5}
            value={ui.brushRadius}
            onChange={(e) => store.setBrushRadius(Number(e.target.value))}
          />
          {ui.brushRadius}
        </span>
      </div>

      <div className="tool-group">
        <button onClick={() => store.undo()} disabled={!history.canUndo}>↶ 撤销</button>
        <button onClick={() => store.redo()} disabled={!history.canRedo}>↷ 重做</button>
        <button
          className="danger-text"
          onClick={() => {
            if (confirm('清空全部标记与轮廓？此操作本身也可撤销。')) store.clearAllEdits();
          }}
        >
          清空
        </button>
      </div>

      <div className="tool-group">
        <label className="wl-control">
          窗位 {ui.window.center.toFixed(0)}
          <input
            type="range"
            min={0}
            max={store.dataset.volume.meta.intensityRange.max}
            value={ui.window.center}
            onChange={(e) =>
              store.setWindow({ ...ui.window, center: Number(e.target.value) })
            }
          />
        </label>
        <label className="wl-control">
          窗宽 {ui.window.width.toFixed(0)}
          <input
            type="range"
            min={1}
            max={store.dataset.volume.meta.intensityRange.max * 1.5}
            value={ui.window.width}
            onChange={(e) =>
              store.setWindow({ ...ui.window, width: Number(e.target.value) })
            }
          />
        </label>
        <button
          onClick={() => {
            const r = store.dataset.volume.meta.intensityRange;
            store.setWindow({ center: (r.min + r.max) / 2, width: r.max - r.min });
          }}
        >
          重置窗
        </button>
      </div>

      <div className="tool-group">
        <button onClick={onOpenImport}>导入切片清单…</button>
      </div>
    </div>
  );
}

export function LabelBar() {
  const store = useStore();
  useStoreVersion();
  return (
    <div className="label-bar">
      <button className="add-label" onClick={() => store.addLabel()}>＋ 新建缺陷标签</button>
      {store.doc.labels.map((l) => (
        <div
          key={l.id}
          className={`label-chip ${store.ui.activeLabelId === l.id ? 'active' : ''}`}
          onClick={() => store.setActiveLabel(l.id)}
        >
          <span className="dot" style={{ background: l.color }} />
          <input
            value={l.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => store.renameLabel(l.id, e.target.value)}
          />
          <button
            className="x"
            title="删除标签及其轮廓"
            onClick={(e) => {
              e.stopPropagation();
              store.deleteLabel(l.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      {uiHint(store.ui.tool)}
    </div>
  );
}

function uiHint(tool: ToolId) {
  const t = TOOLS.find((x) => x.id === tool);
  return <span className="tool-hint">{t?.hint}</span>;
}

export function CandidateBar() {
  const store = useStore();
  useStoreVersion();
  const c = store.ui.candidate;
  if (!c) return null;
  return (
    <div className={`candidate-bar ${c.closed ? 'closed' : 'open'}`}>
      <span>
        候选轮廓：{c.view} 深度 {c.depth} · {c.points.length} 点 ·{' '}
        {c.closed ? <b className="ok">已闭合</b> : <b className="warn">未闭合（采用后会阻止定量）</b>}
      </span>
      <span className="spacer" />
      <button
        disabled={!store.ui.activeLabelId || c.points.length < 3}
        onClick={() => store.adoptCandidate()}
        title={store.ui.activeLabelId ? '' : '请先新建/选择缺陷标签'}
      >
        采用候选
      </button>
      <button onClick={() => store.cancelCandidate()}>放弃</button>
      {!store.ui.activeLabelId && <span className="warn">请先选择标签</span>}
    </div>
  );
}
