import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistoryItem, QuickConnectProtocol, SshSessionConfig } from '../types';
import { useWorkspaceStore } from '../store/workspaceStore';
import { BookmarkList } from './BookmarkList';
import { SshConnectionForm } from './SshConnectionForm';

interface OmniboxBookmarkTabProps {
  keyword: string;
  showConnectionsOverview: boolean;
  onOpenProtocolTab: (config: {
    title: string;
    protocol: QuickConnectProtocol;
    host?: string;
    port?: number;
    username?: string;
    authType?: 'PASSWORD' | 'KEYPAIR';
    secretRef?: string;
    description?: string;
  }) => void;
  onOpenLocalTerminal: () => void;
  closePopover: () => void;
}

function fuzzyScore(keyword: string, text: string) {
  const query = keyword.trim().toLowerCase();
  if (!query) return 1;
  const target = text.toLowerCase();
  if (target.includes(query)) return 100 - target.indexOf(query);

  let lastIndex = -1;
  let score = 0;
  for (const char of query) {
    const nextIndex = target.indexOf(char, lastIndex + 1);
    if (nextIndex === -1) return -1;
    score += 2;
    if (nextIndex === lastIndex + 1) score += 4;
    lastIndex = nextIndex;
  }
  return score;
}

export function OmniboxBookmarkTab({
  keyword,
  showConnectionsOverview,
  onOpenProtocolTab,
  onOpenLocalTerminal,
  closePopover,
}: OmniboxBookmarkTabProps) {
  const { t } = useTranslation();
  const bookmarkTree = useWorkspaceStore((state) => state.bookmarkTree);
  const history = useWorkspaceStore((state) => state.history);
  const bookmarkEditor = useWorkspaceStore((state) => state.bookmarkEditor);
  const setBookmarkEditor = useWorkspaceStore((state) => state.setBookmarkEditor);
  const createBookmarkGroup = useWorkspaceStore((state) => state.createBookmarkGroup);
  const renameBookmarkGroup = useWorkspaceStore((state) => state.renameBookmarkGroup);
  const deleteBookmarkGroup = useWorkspaceStore((state) => state.deleteBookmarkGroup);
  const saveBookmark = useWorkspaceStore((state) => state.saveBookmark);
  const deleteBookmark = useWorkspaceStore((state) => state.deleteBookmark);
  const duplicateBookmark = useWorkspaceStore((state) => state.duplicateBookmark);
  const openBookmarkSession = useWorkspaceStore((state) => state.openBookmarkSession);

  const flatBookmarks = useMemo(
    () =>
      bookmarkTree
        .flatMap((group) => group.items)
        .filter((item) =>
          `${item.title} ${item.host} ${item.protocol} ${item.description ?? ''}`.toLowerCase().includes(keyword.trim().toLowerCase()),
        )
        .slice(0, 8),
    [bookmarkTree, keyword],
  );

  const historyResults = useMemo(
    () =>
      history
        .map((item) => ({
          item,
          score: fuzzyScore(keyword, `${item.name} ${item.protocol} ${item.host ?? ''} ${item.description ?? ''}`),
        }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((entry) => entry.item),
    [history, keyword],
  );

  const handleConnect = (config: SshSessionConfig) => {
    onOpenProtocolTab({
      title: config.title.trim() || config.host,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      secretRef: config.secretRef,
      description: config.description,
    });
  };

  const handleSave = async (config: SshSessionConfig) => {
    await saveBookmark(config);
  };

  const handleHistoryOpen = (entry: HistoryItem) => {
    if (entry.protocol === 'TERMINAL') {
      onOpenLocalTerminal();
      closePopover();
      return;
    }

    if (entry.protocol === 'DASHBOARD') {
      closePopover();
      return;
    }

    onOpenProtocolTab({
      title: entry.name,
      protocol: entry.protocol,
      host: entry.host ?? '',
      port: entry.port ?? 22,
      username: entry.username ?? 'root',
    });
    closePopover();
  };

  return (
    <div className="space-y-6">
      {showConnectionsOverview ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
              {t('omnibox.recent_history')}
            </div>
            <div className="space-y-2">
              {historyResults.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-3 py-6 text-center text-sm text-[var(--app-text-soft)]">
                  {keyword.trim() ? t('omnibox.no_results') : t('omnibox.no_history')}
                </div>
              ) : (
                historyResults.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleHistoryOpen(entry)}
                    className="block w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
                  >
                    <div className="text-sm font-medium text-white">{entry.name}</div>
                    <div className="mt-1 text-xs text-[var(--app-text-muted)]">
                      {t(`protocols.${entry.protocol}`)} {entry.host ? `· ${entry.host}` : ''} {entry.description ? `· ${entry.description}` : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
            <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
              {t('omnibox.bookmark_connections')}
            </div>
            <div className="space-y-2">
              {flatBookmarks.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-3 py-6 text-center text-sm text-[var(--app-text-soft)]">
                  {keyword.trim() ? t('omnibox.no_results') : t('home.no_bookmarks')}
                </div>
              ) : (
                flatBookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    onClick={() => {
                      openBookmarkSession(bookmark);
                      closePopover();
                    }}
                    className="block w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
                  >
                    <div className="text-sm font-medium text-white">{bookmark.title || bookmark.host}</div>
                    <div className="mt-1 text-xs text-[var(--app-text-muted)]">
                      {t(`protocols.${bookmark.protocol}`)} · {bookmark.host}{bookmark.port !== 22 ? `:${bookmark.port}` : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <BookmarkList
            tree={bookmarkTree}
            keyword={keyword}
            onOpen={(bookmark) => {
              openBookmarkSession(bookmark);
              closePopover();
            }}
            onEdit={(bookmark) => setBookmarkEditor(bookmark)}
            onDuplicate={(bookmarkId) => void duplicateBookmark(bookmarkId)}
            onDelete={(bookmarkId) => void deleteBookmark(bookmarkId)}
            onCreateGroup={async (name) => {
              await createBookmarkGroup(name);
            }}
            onRenameGroup={async (groupId, name) => {
              await renameBookmarkGroup(groupId, name);
            }}
            onDeleteGroup={async (groupId) => {
              await deleteBookmarkGroup(groupId);
            }}
          />
        </div>

        <div className="space-y-4">
          <SshConnectionForm
            groups={bookmarkTree}
            initialValue={bookmarkEditor}
            onCancel={() => setBookmarkEditor(null)}
            onSave={handleSave}
            onConnect={handleConnect}
          />
        </div>
      </div>
    </div>
  );
}
