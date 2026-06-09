import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  BookmarkGroupWithItems,
  HistoryItem,
  QuickCommandItem,
  ServerConnection,
  SshSessionConfig,
  SessionConfig,
  WorkspaceProtocol,
  WorkspaceTabInstance,
} from "../types";

interface WorkspaceStore {
  tabs: WorkspaceTabInstance[];
  activeTabId: string;
  bookmarkTree: BookmarkGroupWithItems[];
  quickCommands: QuickCommandItem[];
  history: HistoryItem[];
  bookmarkEditor: SshSessionConfig | null;
  quickCommandEditor: QuickCommandItem | null;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  openLocalTerminalTab: () => void;
  openServerTab: (connection: Omit<ServerConnection, "id">) => void;
  openProtocolTab: (config: {
    title: string;
    protocol: WorkspaceProtocol;
    host?: string;
    port?: number;
    username?: string;
    authType?: "PASSWORD" | "KEYPAIR";
    secretRef?: string;
    description?: string;
  }) => void;
  updateServerTabActiveView: (tabId: string, activeTab: "SSH" | "SFTP") => void;
  setBookmarkEditor: (bookmark: SshSessionConfig | null) => void;
  setQuickCommandEditor: (command: QuickCommandItem | null) => void;
  loadBookmarkTree: () => Promise<void>;
  loadQuickCommands: () => Promise<void>;
  createBookmarkGroup: (name: string) => Promise<string>;
  renameBookmarkGroup: (groupId: string, name: string) => Promise<void>;
  deleteBookmarkGroup: (groupId: string) => Promise<void>;
  saveBookmark: (bookmark: SshSessionConfig) => Promise<string>;
  deleteBookmark: (bookmarkId: string) => Promise<void>;
  duplicateBookmark: (bookmarkId: string) => Promise<string>;
  saveQuickCommand: (command: QuickCommandItem) => Promise<string>;
  deleteQuickCommand: (commandId: string) => Promise<void>;
  openDevTools: () => Promise<void>;
  openBookmarkSession: (bookmark: SshSessionConfig) => void;
}

const dashboardTab: WorkspaceTabInstance = {
  id: "dashboard",
  title: "Dashboard",
  protocol: "DASHBOARD",
  sessionId: null,
  closable: false,
};

const defaultBookmarkTree: BookmarkGroupWithItems[] = [
  {
    group: {
      id: "default",
      name: "Default",
      is_system: true,
    },
    items: [],
  },
];

function prependHistory(history: HistoryItem[], item: HistoryItem) {
  const next = [
    item,
    ...history.filter(
      (entry) =>
        !(
          entry.protocol === item.protocol &&
          entry.host === item.host &&
          entry.name === item.name
        ),
    ),
  ];
  return next.slice(0, 12);
}

function buildServerTab(
  id: string,
  connection: Omit<ServerConnection, "id">,
  protocolOverride?: WorkspaceProtocol,
): WorkspaceTabInstance {
  const protocol = protocolOverride ?? connection.activeTab;
  return {
    id,
    title: connection.name,
    protocol,
    sessionId: id,
    closable: true,
    connection: {
      ...connection,
      id,
      activeTab: protocol === "SFTP" ? "SFTP" : "SSH",
    },
  };
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  tabs: [dashboardTab],
  activeTabId: "dashboard",
  bookmarkTree: defaultBookmarkTree,
  quickCommands: [],
  history: [],
  bookmarkEditor: null,
  quickCommandEditor: null,
  setActiveTab: (id) => set({ activeTabId: id }),
  closeTab: (id) =>
    set((state) => {
      const nextTabs = state.tabs.filter((tab) => tab.id !== id);
      const nextActiveTabId =
        state.activeTabId === id
          ? (nextTabs[nextTabs.length - 1]?.id ?? "dashboard")
          : state.activeTabId;
      return {
        tabs: nextTabs.length > 0 ? nextTabs : [dashboardTab],
        activeTabId: nextActiveTabId,
      };
    }),
  openLocalTerminalTab: () =>
    set((state) => {
      const id = crypto.randomUUID();
      const session: SessionConfig = {
        id,
        name: "Local Terminal",
        protocol: "TERMINAL",
        meta: {},
      };
      return {
        tabs: [
          ...state.tabs,
          {
            id,
            title: "Local Terminal",
            protocol: "TERMINAL",
            sessionId: id,
            closable: true,
            session,
          },
        ],
        activeTabId: id,
        history: prependHistory(state.history, {
          id: `history-${id}`,
          name: "Local Terminal",
          protocol: "TERMINAL",
          openedAt: Date.now(),
          description: "Local shell session",
        }),
      };
    }),
  openServerTab: (connection) =>
    set((state) => {
      const id = crypto.randomUUID();
      const nextTab = buildServerTab(id, connection);
      return {
        tabs: [...state.tabs, nextTab],
        activeTabId: id,
        history: prependHistory(state.history, {
          id: `history-${id}`,
          name: connection.name,
          protocol: nextTab.protocol,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          openedAt: Date.now(),
          description:
            connection.description ||
            `${nextTab.protocol} · ${connection.host}`,
        }),
      };
    }),
  openProtocolTab: (config) =>
    set((state) => {
      if (config.protocol === "TERMINAL") {
        return state;
      }
      if (config.protocol === "SSH" || config.protocol === "SFTP") {
        const id = crypto.randomUUID();
        const tab = buildServerTab(
          id,
          {
            name: config.title,
            host: config.host ?? "",
            port: config.port ?? 22,
            username: config.username,
            authType: config.authType,
            secretRef: config.secretRef,
            description: config.description,
            activeTab: config.protocol,
          },
          config.protocol,
        );
        return {
          tabs: [...state.tabs, tab],
          activeTabId: id,
          history: prependHistory(state.history, {
            id: `history-${id}`,
            name: config.title,
            protocol: config.protocol,
            host: config.host,
            port: config.port,
            username: config.username,
            openedAt: Date.now(),
            description:
              config.description || `${config.protocol} · ${config.host ?? ""}`,
          }),
        };
      }
      const id = crypto.randomUUID();
      return {
        tabs: [
          ...state.tabs,
          {
            id,
            title: config.title,
            protocol: config.protocol,
            sessionId: id,
            closable: true,
          },
        ],
        activeTabId: id,
        history: prependHistory(state.history, {
          id: `history-${id}`,
          name: config.title,
          protocol: config.protocol,
          host: config.host,
          port: config.port,
          username: config.username,
          openedAt: Date.now(),
          description: `${config.protocol} · ${config.host ?? ""}`,
        }),
      };
    }),
  updateServerTabActiveView: (tabId, activeTab) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.connection && tab.id === tabId
          ? {
              ...tab,
              protocol: activeTab,
              connection: {
                ...tab.connection,
                activeTab,
              },
            }
          : tab,
      ),
    })),
  setBookmarkEditor: (bookmark) => set({ bookmarkEditor: bookmark }),
  setQuickCommandEditor: (command) => set({ quickCommandEditor: command }),
  loadBookmarkTree: async () => {
    try {
      const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
      set({ bookmarkTree: tree });
    } catch {
      set({ bookmarkTree: defaultBookmarkTree });
    }
  },
  loadQuickCommands: async () => {
    try {
      const quickCommands =
        await invoke<QuickCommandItem[]>("get_quick_commands");
      set({ quickCommands });
    } catch {
      set({ quickCommands: [] });
    }
  },
  createBookmarkGroup: async (name) => {
    const groupId = await invoke<string>("create_bookmark_group", { name });
    const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
    set({ bookmarkTree: tree });
    return groupId;
  },
  renameBookmarkGroup: async (groupId, name) => {
    await invoke("rename_bookmark_group", { groupId, name });
    const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
    set({ bookmarkTree: tree });
  },
  deleteBookmarkGroup: async (groupId) => {
    await invoke("delete_bookmark_group", { groupId });
    const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
    set({ bookmarkTree: tree });
  },
  saveBookmark: async (bookmark) => {
    const bookmarkId = await invoke<string>("save_bookmark", {
      config: bookmark,
    });
    const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
    set({ bookmarkTree: tree, bookmarkEditor: null });
    return bookmarkId;
  },
  deleteBookmark: async (bookmarkId) => {
    await invoke("delete_bookmark", { bookmarkId });
    const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
    set((state) => ({
      bookmarkTree: tree,
      bookmarkEditor:
        state.bookmarkEditor?.id === bookmarkId ? null : state.bookmarkEditor,
    }));
  },
  duplicateBookmark: async (bookmarkId) => {
    const nextId = await invoke<string>("duplicate_bookmark", { bookmarkId });
    const tree = await invoke<BookmarkGroupWithItems[]>("get_bookmark_tree");
    set({ bookmarkTree: tree });
    return nextId;
  },
  saveQuickCommand: async (command) => {
    const commandId = await invoke<string>("save_quick_command", { command });
    const quickCommands =
      await invoke<QuickCommandItem[]>("get_quick_commands");
    set({ quickCommands, quickCommandEditor: null });
    return commandId;
  },
  deleteQuickCommand: async (commandId) => {
    await invoke("delete_quick_command", { commandId });
    const quickCommands =
      await invoke<QuickCommandItem[]>("get_quick_commands");
    set((state) => ({
      quickCommands,
      quickCommandEditor:
        state.quickCommandEditor?.id === commandId
          ? null
          : state.quickCommandEditor,
    }));
  },
  openBookmarkSession: (bookmark) =>
    set((state) => {
      const id = crypto.randomUUID();
      const tab = buildServerTab(
        id,
        {
          name: bookmark.title.trim() || bookmark.host,
          host: bookmark.host,
          port: bookmark.port,
          username: bookmark.username,
          authType: bookmark.authType,
          secretRef: bookmark.secretRef,
          description: bookmark.description,
          activeTab: bookmark.protocol,
        },
        bookmark.protocol,
      );
      return {
        tabs: [...state.tabs, tab],
        activeTabId: id,
        history: prependHistory(state.history, {
          id: `history-${id}`,
          name: bookmark.title.trim() || bookmark.host,
          protocol: bookmark.protocol,
          host: bookmark.host,
          port: bookmark.port,
          username: bookmark.username,
          openedAt: Date.now(),
          description:
            bookmark.description || `${bookmark.protocol} · ${bookmark.host}`,
        }),
      };
    }),
  // 打开开发者工具方法的具体实现
  openDevTools: async () => {
    try {
      // 通过 Tauri IPC 触发后端指令
      await invoke("toggle_devtools");
    } catch (error) {
      console.error("打开开发者工具失败:", error);
    }
  },
}));
