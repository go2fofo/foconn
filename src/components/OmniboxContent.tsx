import { Suspense, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import omniboxTabsConfig from '../config/omnibox-tabs.json';
import { OMNIBOX_TAB_REGISTRY } from './omnibox/tabRegistry';
import type { OmniboxOpenContext, OmniboxTabsConfig } from './omnibox/types';

export interface OmniboxContentProps {
  onOpenProtocolTab: import('./omnibox/types').OmniboxTabRendererProps['onOpenProtocolTab'];
  onOpenLocalTerminal: () => void;
  closePopover: () => void;
  openContext: OmniboxOpenContext;
}

const omniboxConfig = omniboxTabsConfig as OmniboxTabsConfig;

export function OmniboxContent({
  onOpenProtocolTab,
  onOpenLocalTerminal,
  closePopover,
  openContext,
}: OmniboxContentProps) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');

  const tabs = omniboxConfig.tabs;
  const [activeTabId, setActiveTabId] = useState(omniboxConfig.initialTabByContext[openContext] ?? tabs[0]?.id ?? 'bookmarks');

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs],
  );

  const content = useMemo(() => {
    if (!activeTab) return null;
    const renderer = OMNIBOX_TAB_REGISTRY[activeTab.view];
    return renderer({
      keyword,
      openContext,
      activeTab,
      onOpenProtocolTab,
      onOpenLocalTerminal,
      closePopover,
    });
  }, [activeTab, closePopover, keyword, onOpenLocalTerminal, onOpenProtocolTab, openContext]);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden p-6"
      style={{ background: 'var(--app-panel-bg)' }}
    >
      <div className="mb-5 flex shrink-0 items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-[var(--app-info)]">{t('omnibox.title')}</div>
          <div className="mt-2 text-2xl font-semibold text-white">{activeTab ? t(activeTab.titleKey) : t('omnibox.title')}</div>
          <div className="mt-2 text-xs text-[var(--app-text-soft)]">{activeTab ? t(activeTab.descriptionKey) : ''}</div>
        </div>
        <button
          type="button"
          onClick={closePopover}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-input)] text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
          aria-label={t('omnibox.close')}
          title={t('omnibox.close')}
        >
          <X size={18} />
        </button>
      </div>

      <div className="mb-4 flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`rounded-[14px] border px-4 py-2 text-sm transition ${
                isActive
                  ? 'border-[var(--app-border-strong)] bg-[var(--app-bg-hover)] text-white'
                  : 'border-[var(--app-border)] bg-[var(--app-bg-input)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {activeTab?.showSearch ? (
        <div className="mb-6 shrink-0 rounded-[20px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-4 py-3">
          <input
            autoFocus
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('omnibox.search_placeholder')}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--app-text-soft)]"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <Suspense
          fallback={
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-6 py-10 text-sm text-[var(--app-text-soft)]">
              {t('omnibox.loading_tab')}
            </div>
          }
        >
          {content}
        </Suspense>
      </div>
    </div>
  );
}
