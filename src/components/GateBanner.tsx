import { useStore } from '../state/store';

/** 门禁状态条：阻断项逐条列出；全部通过时显示定量结论可用 */
export function GateBanner() {
  const { derived } = useStore();
  const { gates } = derived;

  if (gates.issues.length === 0) {
    return <div className="gate-banner ok">✓ 数据完整，定量结论可用</div>;
  }
  return (
    <div className="gate-banner blocked">
      <strong>{gates.quantitativeAllowed ? '部分结论受限' : '⛔ 定量结论已阻止'}</strong>
      <ul>
        {gates.issues.map((i) => (
          <li key={i.code}>[{i.code}] {i.message}</li>
        ))}
      </ul>
    </div>
  );
}
