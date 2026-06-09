/*
 * @Author: fofo
 * @Date: 2026-06-08 13:50:49
 * @LastEditTime: 2026-06-08 13:50:51
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/store/vfsStore.ts
 */
import { create } from 'zustand';
import { TransferProgress } from '../types';

interface TransferState {
  tasks: Record<string, TransferProgress>;
  history: TransferProgress[];
  addTask: (task: TransferProgress) => void;
  updateTask: (progress: TransferProgress) => void;
  syncTasks: (tasks: TransferProgress[]) => void;
  clearHistory: () => void;
}

export const useTransferStore = create<TransferState>((set) => ({
  tasks: {},
  history: [],
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
  clearHistory: () => set({ history: [] })
}));
