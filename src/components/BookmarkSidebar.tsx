import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../store/workspaceStore';

interface BookmarkSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookmarkSidebar({ isOpen, onClose }: BookmarkSidebarProps) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const bookmarkTree = useWorkspaceStore((state) => state.bookmarkTree);
  const openBookmarkSession = useWorkspaceStore((state) => state.openBookmarkSession);

  const filteredTree = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return bookmarkTree;
    return bookmarkTree
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.title} ${item.host} ${item.protocol} ${item.description ?? ''}`.toLowerCase().includes(normalized),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [bookmarkTree, keyword]);

  return (
    <div
      className={`fixed inset-y-0 right-0 z-[120] w-[380px] max-w-[calc(100vw-24px)] transform border-l border-[var(--app-border-strong)] bg-[var(--app-bg-container)] shadow-[var(--app-shadow-elevated)] transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-[var(--app-border)] px-5 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-info)]">{t('entrypoints.bookmark_panel')}</div>
            <div className="mt-2 text-xl font-semibold text-white">{t('entrypoints.view_all_bookmarks')}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-input)] text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-[var(--app-border)] px-5 py-4">
          <div className="flex items-center gap-3 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3">
            <Search size={16} className="text-[var(--app-text-soft)]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('entrypoints.bookmark_search')}
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--app-text-soft)]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {filteredTree.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-8 text-center text-sm text-[var(--app-text-soft)]">
                {t('omnibox.no_results')}
              </div>
            ) : (
              filteredTree.map(({ group, items }) => (
                <div key={group.id} className="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-3">
                  <div className="px-2 pb-2 text-xs uppercase tracking-[0.16em] text-[var(--app-text-soft)]">
                    {group.id === 'default' ? t('omnibox.default_group') : group.name}
                  </div>
                  <div className="space-y-2">
                    {items.map((bookmark) => (
                      <button
                        key={bookmark.id}
                        type="button"
                        onClick={() => {
                          openBookmarkSession(bookmark);
                          onClose();
                        }}
                        className="block w-full rounded-[16px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
                      >
                        <div className="text-sm font-medium text-white">{bookmark.title.trim() || bookmark.host}</div>
                        <div className="mt-1 text-xs text-[var(--app-text-muted)]">
                          {t(`protocols.${bookmark.protocol}`)} · {bookmark.host}{bookmark.port !== 22 ? `:${bookmark.port}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
