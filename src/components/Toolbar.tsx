import { useStore, type Tool } from '../state/store';
import { canRedo, canUndo } from '../core/history';
import { SIM_SOURCE_COMPLETE, SIM_SOURCE_MISSING } from '../core/simdata';

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'crosshair', label: '十字光标' },
  { id: 'draw-defect', label: '勾画缺陷' },
  { id: 'draw-surface', label: '标记外表面' },
  { id: 'erase', label: '擦除轮廓' },
];

export function Toolbar() {
  const { state, dispatch } = useStore();
  const { tool, wl, contoursHist, autoSurface, candidate } = state;

  return (
    <div className="toolbar">
      <div className="tb-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tb-group">
        <label>
          窗宽
          <input
            type="number"
            value={Math.round(wl.w)}
            min={1}
            onChange={(e) => dispatch({ type: 'SET_WL', wl: { w: Math.max(1, Number(e.target.value)), c: wl.c } })}
          />
        </label>
        <label>
          窗位
          <input
            type="number"
            value={Math.round(wl.c)}
            onChange={(e) => dispatch({ type: 'SET_WL', wl: { w: wl.w, c: Number(e.target.value) } })}
          />
        </label>
      </div>

      <div className="tb-group">
        <button disabled={!canUndo(contoursHist)} onClick={() => dispatch({ type: 'UNDO' })}>
          撤销
        </button>
        <button disabled={!canRedo(contoursHist)} onClick={() => dispatch({ type: 'REDO' })}>
          重做
        </button>
        <button onClick={() => dispatch({ type: 'CLEAR_ANNOTATIONS' })}>清空轮廓</button>
        <label className="chk">
          <input
            type="checkbox"
            checked={autoSurface}
            onChange={(e) => dispatch({ type: 'SET_AUTO_SURFACE', on: e.target.checked })}
          />
          自动外表面（阈值分割）
        </label>
      </div>

      <div className="tb-group">
        <button onClick={() => dispatch({ type: 'LOAD_SIM', sourceId: SIM_SOURCE_COMPLETE })}>
          模拟数据（完整）
        </button>
        <button onClick={() => dispatch({ type: 'LOAD_SIM', sourceId: SIM_SOURCE_MISSING })}>
          模拟数据（缺层）
        </button>
        <button onClick={() => dispatch({ type: 'SET_IMPORT_OPEN', open: true })}>导入清单…</button>
      </div>

      {candidate && (
        <div className="tb-group candidate-bar">
          <span>
            候选轮廓：{candidate.kind === 'defect' ? '缺陷' : '外表面'} · {candidate.points.length} 点 ·{' '}
            {candidate.closed ? '已闭合' : '未闭合（点击首点或"闭合"）'}
          </span>
          <button onClick={() => dispatch({ type: 'CANDIDATE_CLOSE' })} disabled={candidate.points.length < 3 || candidate.closed}>
            闭合
          </button>
          <button className="primary" onClick={() => dispatch({ type: 'CANDIDATE_ADOPT' })} disabled={candidate.points.length < 2}>
            采用
          </button>
          <button onClick={() => dispatch({ type: 'CANDIDATE_UNDO_POINT' })}>撤销点</button>
          <button onClick={() => dispatch({ type: 'CANDIDATE_CANCEL' })}>取消</button>
        </div>
      )}
    </div>
  );
}
