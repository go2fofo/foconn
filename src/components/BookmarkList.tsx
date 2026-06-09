import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookmarkGroupWithItems, SshSessionConfig } from '../types';

interface BookmarkListProps {
  tree: BookmarkGroupWithItems[];
  keyword: string;
  onOpen: (bookmark: SshSessionConfig) => void;
  onEdit: (bookmark: SshSessionConfig) => void;
  onDuplicate: (bookmarkId: string) => void;
  onDelete: (bookmarkId: string) => void;
  onCreateGroup: (name: string) => Promise<void> | void;
  onRenameGroup: (groupId: string, name: string) => Promise<void> | void;
  onDeleteGroup: (groupId: string) => Promise<void> | void;
}

export function BookmarkList({
  tree,
  keyword,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: BookmarkListProps) {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ default: true });
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  const filteredTree = useMemo(() => {
    const nextKeyword = keyword.trim().toLowerCase();
    if (!nextKeyword) return tree;
    return tree
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.title} ${item.host} ${item.protocol} ${item.description ?? ''}`.toLowerCase().includes(nextKeyword),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [keyword, tree]);

  const groupItemCount = useMemo(
    () =>
      Object.fromEntries(tree.map(({ group, items }) => [group.id, items.length])),
    [tree],
  );

  const startCreateGroup = () => {
    setIsCreatingGroup(true);
    setNewGroupName('');
  };

  const submitCreateGroup = async () => {
    const nextName = newGroupName.trim();
    if (!nextName) return;
    await onCreateGroup(nextName);
    setIsCreatingGroup(false);
    setNewGroupName('');
  };

  const startRenameGroup = (groupId: string, groupName: string) => {
    setEditingGroupId(groupId);
    setEditingGroupName(groupName);
  };

  const submitRenameGroup = async (groupId: string) => {
    const nextName = editingGroupName.trim();
    if (!nextName) return;
    await onRenameGroup(groupId, nextName);
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  return (
    <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
      <div className="flex gap-3 justify-between items-center mb-4">
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
          {t('omnibox.bookmark_manager')}
        </div>
        <button
          type="button"
          onClick={startCreateGroup}
          className="rounded-[12px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-3 py-1.5 text-xs text-[var(--app-text-base)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
        >
          {t('omnibox.add_group')}
        </button>
      </div>

      <div className="space-y-3">
        {isCreatingGroup ? (
          <div className="rounded-[20px] border border-[var(--app-border-strong)] bg-[var(--app-bg-input)] p-3">
            <input
              autoFocus
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder={t('omnibox.group_name_placeholder')}
              className="w-full rounded-[16px] border border-[var(--app-border)] bg-[var(--app-bg-container)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
            />
            <div className="flex gap-2 justify-end mt-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreatingGroup(false);
                  setNewGroupName('');
                }}
                className="rounded-[12px] border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)] transition hover:bg-[var(--app-bg-hover)] hover:text-white"
              >
                {t('omnibox.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void submitCreateGroup()}
                className="rounded-[12px] border border-[var(--app-border-strong)] bg-[var(--app-bg-hover)] px-3 py-1.5 text-xs text-white transition hover:bg-[var(--app-bg-hover-strong)]"
              >
                {t('omnibox.save')}
              </button>
            </div>
          </div>
        ) : null}

        {filteredTree.map(({ group, items }) => {
          const isExpanded = expandedGroups[group.id] ?? group.id === 'default';
          const isEditingGroup = editingGroupId === group.id;
          const itemCount = groupItemCount[group.id] ?? 0;
          const cannotDeleteGroup = group.is_system || itemCount > 0;
          const deleteTitle = group.is_system
            ? t('omnibox.system_group_locked')
            : itemCount > 0
              ? t('omnibox.delete_group_blocked')
              : t('omnibox.delete_group');
          return (
            <div key={group.id} className="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-bg-input)]">
              <div className="flex gap-3 items-center px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [group.id]: !isExpanded,
                    }))
                  }
                  className="flex min-w-0 flex-1 items-center justify-between text-left text-sm text-[var(--app-text-base)] transition hover:text-white"
                >
                  {isEditingGroup ? (
                    <input
                      autoFocus
                      value={editingGroupName}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setEditingGroupName(event.target.value)}
                      className="w-full rounded-[12px] border border-[var(--app-border)] bg-[var(--app-bg-container)] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
                    />
                  ) : (
                    <span className="truncate">{group.id === 'default' ? t('omnibox.default_group') : group.name}</span>
                  )}
                  <span className="ml-3 shrink-0 text-xs text-[var(--app-text-soft)]">{isExpanded ? '−' : '+'}</span>
                </button>

                {isEditingGroup ? (
                  <div className="flex gap-1 items-center">
                    <button
                      type="button"
                      onClick={() => void submitRenameGroup(group.id)}
                      className="rounded-[12px] border border-[var(--app-border-strong)] px-2 py-1 text-xs text-white transition hover:bg-[var(--app-bg-hover)]"
                    >
                      {t('omnibox.save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroupId(null);
                        setEditingGroupName('');
                      }}
                      className="rounded-[12px] border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-muted)] transition hover:bg-[var(--app-bg-hover)] hover:text-white"
                    >
                      {t('omnibox.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1 items-center">
                    {!group.is_system ? (
                      <button
                        type="button"
                        onClick={() => startRenameGroup(group.id, group.name)}
                        className="rounded-[12px] border border-transparent px-2 py-1 text-xs text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
                      >
                        {t('omnibox.edit_group')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={cannotDeleteGroup}
                      title={deleteTitle}
                      onClick={() => {
                        if (cannotDeleteGroup) {
                          window.alert(deleteTitle);
                          return;
                        }
                        void onDeleteGroup(group.id);
                      }}
                      className="rounded-[12px] border border-transparent px-2 py-1 text-xs text-[var(--app-text-muted)] transition hover:border-[var(--app-border-danger)] hover:bg-[var(--app-bg-danger-soft)] hover:text-[var(--app-error)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('omnibox.delete_group')}
                    </button>
                  </div>
                )}
              </div>

              {isExpanded ? (
                <div className="space-y-1 border-t border-[var(--app-border)] p-2">
                  {items.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[var(--app-text-muted)]">{t('omnibox.no_bookmark_items')}</div>
                  ) : (
                    items.map((item) => {
                      const title = item.title.trim() || item.host;
                      const secondary = title === item.host ? '' : `${item.host}${item.port !== 22 ? `:${item.port}` : ''}`;
                      return (
                        <div
                          key={item.id}
                          title={item.description ?? ''}
                          onDoubleClick={() => onOpen(item)}
                          className="group flex items-center gap-3 rounded-[16px] px-3 py-3 transition hover:bg-[var(--app-bg-hover)]"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">
                              [{item.protocol}] {title}
                              {secondary ? <span className="ml-2 text-xs text-[var(--app-text-muted)]">({secondary})</span> : null}
                            </div>
                          </div>
                          <div className="flex gap-1 items-center opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="rounded-[12px] border border-transparent px-2 py-1 text-xs text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
                            >
                              {t('omnibox.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDuplicate(item.id)}
                              className="rounded-[12px] border border-transparent px-2 py-1 text-xs text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
                            >
                              {t('omnibox.duplicate')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(item.id)}
                              className="rounded-[12px] border border-transparent px-2 py-1 text-xs text-[var(--app-text-muted)] transition hover:border-[var(--app-border-danger)] hover:bg-[var(--app-bg-danger-soft)] hover:text-[var(--app-error)]"
                            >
                              {t('omnibox.delete')}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
