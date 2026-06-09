import { create } from 'zustand';

export interface GlobalLoadingOptions {
  message?: string;
  detail?: string;
}

export interface GlobalLoadingRequest extends GlobalLoadingOptions {
  id: string;
  startedAt: number;
}

interface GlobalLoadingState {
  requests: GlobalLoadingRequest[];
  showLoading: (options?: GlobalLoadingOptions) => string;
  hideLoading: (id: string) => void;
  clearLoading: () => void;
}

function createLoadingId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `loading-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useGlobalLoadingStore = create<GlobalLoadingState>((set) => ({
  requests: [],
  showLoading: (options) => {
    const id = createLoadingId();
    set((state) => ({
      requests: [
        ...state.requests,
        {
          id,
          startedAt: Date.now(),
          ...options,
        },
      ],
    }));
    return id;
  },
  hideLoading: (id) =>
    set((state) => ({
      requests: state.requests.filter((request) => request.id !== id),
    })),
  clearLoading: () => set({ requests: [] }),
}));

export async function withGlobalLoading<T>(
  task: () => Promise<T>,
  options?: GlobalLoadingOptions,
): Promise<T> {
  const id = useGlobalLoadingStore.getState().showLoading(options);
  try {
    return await task();
  } finally {
    useGlobalLoadingStore.getState().hideLoading(id);
  }
}
