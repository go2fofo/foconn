import { useTranslation } from 'react-i18next';
import type { QuickConnectProtocol, SshSessionConfig } from '../types';
import { useMemo } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { SshConnectionForm } from './SshConnectionForm';

interface HomeProps {
  onOpenLocal: () => void;
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
}

export function Home({ onOpenLocal, onOpenProtocolTab }: HomeProps) {
  const { t } = useTranslation();
  const bookmarkTree = useWorkspaceStore((state) => state.bookmarkTree);
  const history = useWorkspaceStore((state) => state.history);
  const saveBookmark = useWorkspaceStore((state) => state.saveBookmark);

  const bookmarks = useMemo(
    () => bookmarkTree.flatMap((group) => group.items),
    [bookmarkTree],
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

  return (
    <div className="h-full overflow-hidden px-6 py-6 xl:px-8" style={{ background: 'var(--app-hero-bg)' }}>
      <div className="flex h-full w-full flex-col gap-6 2xl:max-w-[1680px]">
        <section className="shrink-0 grid gap-6 xl:grid-cols-[minmax(360px,440px)_minmax(760px,1fr)]">
          <div className="space-y-6">
            <div
              className="rounded-[28px] border p-7"
              style={{
                borderColor: 'var(--app-border-strong)',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(12, 16, 32, 0.96))',
                boxShadow: 'var(--app-shadow)',
              }}
            >
              <div className="inline-flex rounded-full border border-[var(--app-border-strong)] bg-[var(--app-bg-hover)] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[var(--app-info)]">
                {t('home.dashboard')}
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white">{t('home.dashboard')}</h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-[var(--app-text-muted)]">
                {t('home.shortcut_hint')}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={onOpenLocal}
                  className="rounded-2xl px-5 py-3 text-left text-sm font-medium text-white transition hover:brightness-110"
                  style={{ background: 'var(--app-accent-bg)' }}
                >
                  {t('home.open_local')}
                </button>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-[var(--app-text-muted)]">
                  {t('home.new_connection')} · SSH / SFTP
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">{t('home.bookmarks')}</div>
                <div className="mt-3 text-3xl font-semibold text-white">{bookmarks.length}</div>
                <div className="mt-2 text-sm text-[var(--app-text-muted)]">{t('home.no_bookmarks')}</div>
              </div>
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">{t('home.recent')}</div>
                <div className="mt-3 text-3xl font-semibold text-white">{history.length}</div>
                <div className="mt-2 text-sm text-[var(--app-text-muted)]">{t('home.no_recent')}</div>
              </div>
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">{t('home.new_connection')}</div>
                <div className="mt-3 text-base font-medium text-white">
                  {t('omnibox.session_title')} / {t('home.host')} / {t('omnibox.port')}
                </div>
                <div className="mt-2 text-sm text-[var(--app-text-muted)]">
                  {t('omnibox.username')} · {t('omnibox.auth_type')} · {t('omnibox.description')}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <SshConnectionForm
              heading={t('home.new_connection')}
              groups={bookmarkTree}
              onSave={handleSave}
              onConnect={handleConnect}
            />
          </div>
        </section>

        <section className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[1fr_1fr]">
          <div
            className="flex min-h-0 flex-col rounded-[28px] border bg-[var(--app-bg-panel)] p-6"
            style={{ borderColor: 'var(--app-border)', boxShadow: 'var(--app-shadow)' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">{t('home.bookmarks')}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{t('home.bookmarks')}</div>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {bookmarks.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-5 py-10 text-center text-sm text-[var(--app-text-muted)]">
                  {t('home.no_bookmarks')}
                </div>
              ) : (
                bookmarks.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onOpenProtocolTab({
                        title: item.title || item.host,
                        protocol: item.protocol,
                        host: item.host,
                        port: item.port,
                        username: item.username,
                        authType: item.authType,
                        secretRef: item.secretRef,
                        description: item.description,
                      })
                    }
                    className="block w-full rounded-[20px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-4 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
                  >
                    <div className="text-sm font-medium text-white">{item.title || item.host}</div>
                    <div className="mt-1 text-xs text-[var(--app-text-muted)]">
                      {t(`protocols.${item.protocol}`)} · {item.host}{item.port !== 22 ? `:${item.port}` : ''}{item.description ? ` · ${item.description}` : ''}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col rounded-[28px] border bg-[var(--app-bg-panel)] p-6"
            style={{ borderColor: 'var(--app-border)', boxShadow: 'var(--app-shadow)' }}
          >
            <div className="mb-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">{t('home.recent')}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{t('home.recent')}</div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {history.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-5 py-10 text-center text-sm text-[var(--app-text-muted)]">
                  {t('home.no_recent')}
                </div>
              ) : (
                history.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{item.name}</div>
                        <div className="mt-1 truncate text-xs text-[var(--app-text-muted)]">
                          {t(`protocols.${item.protocol}`)} {item.host ? `· ${item.host}` : ''} {item.description ? `· ${item.description}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-[var(--app-text-soft)]">
                        {new Date(item.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
