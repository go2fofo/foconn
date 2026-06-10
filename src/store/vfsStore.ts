/*
 * @Author: fofo
 * @Date: 2026-06-08 13:50:49
 * @LastEditTime: 2026-06-10 11:24:41
 * @LastEditors: fofo
 * @Description: 扩展支持跨 Tab 路径和选中项状态持久化
 * @FilePath: /foconn/src/store/vfsStore.ts
 */
import { create } from 'zustand';
import { TransferProgress } from '../types';

export interface VfsSessionSnapshot {
  localPath: string;
  remotePath: string;
  localSelectedPaths: string[];
  remoteSelectedPaths: string[];
  lastFocusedSide: 'local' | 'remote' | null;
}

interface TransferState {
  tasks: Record<string, TransferProgress>;
  history: TransferProgress[];
  vfsSnapshots: Record<string, VfsSessionSnapshot>; // 会话快照存储中心
  addTask: (task: TransferProgress) => void;
  updateTask: (progress: TransferProgress) => void;
  syncTasks: (tasks: TransferProgress[]) => void;
  clearHistory: () => void;
  updateVfsSnapshot: (sessionId: string, snapshot: Partial<VfsSessionSnapshot>) => void; // 状态更新原子函数
}

export const useTransferStore = create<TransferState>((set) => ({
  tasks: {},
  history: [],
  vfsSnapshots: {},
  
  addTask: (task) => set((state) => ({
    tasks: { ...state.tasks, [task.task_id]: task }
  })),

  updateTask: (progress) => set((state) => {
    const isDone = progress.status === 'COMPLETED' || progress.status === 'FAILED';
    const newTasks = { ...state.tasks };
    
    if (isDone) {
      delete newTasks[progress.task_id];
      return {
        tasks: newTasks,
        history: [{...progress}, ...state.history].slice(0, 100) // keep last 100
      };
    }

    return {
      tasks: { ...newTasks, [progress.task_id]: progress }
    };
  }),

  syncTasks: (tasks) => set((state) => {
    const activeTasks: Record<string, TransferProgress> = {};
    let nextHistory = state.history;

    for (const task of tasks) {
      const isDone = task.status === 'COMPLETED' || task.status === 'FAILED';
      if (isDone) {
        if (!nextHistory.some((item) => item.task_id === task.task_id && item.status === task.status)) {
          nextHistory = [{ ...task }, ...nextHistory].slice(0, 100);
        }
        continue;
      }
      activeTasks[task.task_id] = task;
    }

    return {
      tasks: activeTasks,
      history: nextHistory,
    };
  }),

  clearHistory: () => set({ history: [] }),

  // 核心逻辑：合并历史旧快照，执行按增量合并策略
  updateVfsSnapshot: (sessionId, snapshot) => set((state) => ({
    vfsSnapshots: {
      ...state.vfsSnapshots,
      [sessionId]: {
        ...(state.vfsSnapshots[sessionId] ?? {
          localPath: '/',
          remotePath: '/',
          localSelectedPaths: [],
          remoteSelectedPaths: [],
          lastFocusedSide: null
        }),
        ...snapshot
      }
    }
  }))
}));