import { FolderTree, PlusSquare, TerminalSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TabPlusDropdownProps {
  onOpenLocalTerminal: () => void;
  onOpenBookmarks: () => void;
  closePopover: () => void;
}

export function TabPlusDropdown({
  onOpenLocalTerminal,
  onOpenBookmarks,
  closePopover,
}: TabPlusDropdownProps) {
  const { t } = useTranslation();

  return (
    <div className="flex w-[280px] flex-col gap-1 p-2">
      <div className="px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
        {t('entrypoints.plus_title')}
      </div>
      <button
        type="button"
        onClick={() => {
          onOpenLocalTerminal();
          closePopover();
        }}
        className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-left transition hover:bg-[var(--app-bg-hover)]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--app-bg-hover)] text-[var(--app-primary)]">
          <TerminalSquare size={16} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-white">{t('entrypoints.new_local_terminal')}</span>
          <span className="mt-1 block text-xs text-[var(--app-text-soft)]">{t('entrypoints.new_local_terminal_desc')}</span>
        </span>
        <PlusSquare size={16} className="text-[var(--app-text-soft)]" />
      </button>
      <button
        type="button"
        onClick={() => {
          onOpenBookmarks();
          closePopover();
        }}
        className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-left transition hover:bg-[var(--app-bg-hover)]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--app-bg-hover)] text-[var(--app-info)]">
          <FolderTree size={16} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-white">{t('entrypoints.view_all_bookmarks')}</span>
          <span className="mt-1 block text-xs text-[var(--app-text-soft)]">{t('entrypoints.view_all_bookmarks_desc')}</span>
        </span>
      </button>
    </div>
  );
}
