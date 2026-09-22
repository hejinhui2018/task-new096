// React 绑定：全局单例 store + useSyncExternalStore
import { createContext, useContext, useSyncExternalStore } from 'react';
import { AppStore } from './store';

export const store = new AppStore();

export const StoreContext = createContext<AppStore>(store);

export function useStore(): AppStore {
  return useContext(StoreContext);
}

/** 订阅 store，状态变化时重渲染组件 */
export function useStoreVersion(): number {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.getVersion, s.getVersion);
}
