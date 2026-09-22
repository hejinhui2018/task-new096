import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from '../src/App';

// 冒烟：整个首屏（三视图、列表、预览、证据面板）在无浏览器 API 时也能完成首次渲染
describe('App 首屏冒烟渲染', () => {
  it('renderToString 不抛异常且包含关键区块', () => {
    const html = renderToString(<App />);
    expect(html).toContain('缺陷复核台');
    expect(html).toContain('轴位');
    expect(html).toContain('矢位');
    expect(html).toContain('冠位');
    expect(html).toContain('缺陷列表');
    expect(html).toContain('体素预览');
    expect(html).toContain('测量证据');
    expect(html).toContain('仅用于复核演示');
  });
});
