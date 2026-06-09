import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookmarkGroupWithItems, SshSessionConfig } from '../types';
import { AppSelect } from './AppSelect';

interface SshConnectionFormProps {
  groups: BookmarkGroupWithItems[];
  heading?: string;
  initialValue?: SshSessionConfig | null;
  onCancel?: () => void;
  onSave: (config: SshSessionConfig) => Promise<void> | void;
  onConnect: (config: SshSessionConfig) => void;
}

function createEmptyForm(): SshSessionConfig {
  return {
    id: crypto.randomUUID(),
    groupId: 'default',
    title: '',
    protocol: 'SSH',
    host: '',
    port: 22,
    username: 'root',
    authType: 'PASSWORD',
    secretRef: '',
    description: '',
    updatedAt: Date.now(),
  };
}

export function SshConnectionForm({
  groups,
  heading,
  initialValue,
  onCancel,
  onSave,
  onConnect,
}: SshConnectionFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<SshSessionConfig>(initialValue ?? createEmptyForm());
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    setForm(
      initialValue
        ? { ...initialValue }
        : createEmptyForm(),
    );
    setIsPasswordVisible(false);
  }, [initialValue]);

  const isValid = useMemo(() => form.host.trim().length > 0 && Number(form.port) > 0, [form.host, form.port]);
  const groupOptions = useMemo(
    () =>
      groups.map((item) => ({
        value: item.group.id,
        label: item.group.id === 'default' ? t('omnibox.default_group') : item.group.name,
      })),
    [groups, t],
  );

  const patchForm = (patch: Partial<SshSessionConfig>) => {
    setForm((current) => ({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    }));
  };

  const normalizedConfig = (): SshSessionConfig => ({
    ...form,
    title: form.title.trim() || form.host.trim(),
    host: form.host.trim(),
    username: form.username?.trim() || undefined,
    secretRef: form.secretRef?.trim() || undefined,
    description: form.description?.trim() || undefined,
    updatedAt: Date.now(),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    await onSave(normalizedConfig());
    setForm(createEmptyForm());
  };

  const handleConnect = () => {
    if (!isValid) return;
    onConnect(normalizedConfig());
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
      <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
        {heading ?? t('omnibox.quick_connect')}
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.bookmark_group')}</label>
            <AppSelect
              value={form.groupId}
              options={groupOptions}
              onChange={(nextValue) => patchForm({ groupId: nextValue })}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.session_title')}</label>
            <input
              value={form.title}
              onChange={(event) => patchForm({ title: event.target.value })}
              placeholder={t('omnibox.title_placeholder')}
              className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.7fr)_120px]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.host')}</label>
            <input
              value={form.host}
              onChange={(event) => patchForm({ host: event.target.value })}
              onBlur={() => {
                if (!form.title.trim() && form.host.trim()) {
                  patchForm({ title: form.host.trim() });
                }
              }}
              placeholder={t('omnibox.host')}
              className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.port')}</label>
            <input
              type="number"
              value={form.port}
              onChange={(event) => patchForm({ port: Number(event.target.value) || 22 })}
              className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
            />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.username')}</label>
            <input
              value={form.username ?? ''}
              onChange={(event) => patchForm({ username: event.target.value })}
              placeholder={t('omnibox.username_placeholder')}
              className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.auth_type')}</label>
            <div className="grid grid-cols-2 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] p-1">
              {(['PASSWORD', 'KEYPAIR'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => patchForm({ authType: item })}
                  className={`rounded px-2 py-1.5 text-xs ${
                    form.authType === item
                      ? 'text-white'
                      : 'text-[var(--app-text-muted)] hover:text-white'
                  }`}
                  style={form.authType === item ? { background: 'var(--app-accent-bg)' } : undefined}
                >
                  {t(`omnibox.${item === 'PASSWORD' ? 'password' : 'keypair'}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">
                {t(`omnibox.${form.authType === 'PASSWORD' ? 'password' : 'keypair'}`)}
              </label>
              {form.authType === 'PASSWORD' ? (
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((current) => !current)}
                  className="text-[11px] uppercase tracking-[0.12em] text-[var(--app-text-soft)] transition hover:text-white"
                >
                  {t(isPasswordVisible ? 'omnibox.hide_password' : 'omnibox.show_password')}
                </button>
              ) : null}
            </div>
            <input
              type={form.authType === 'PASSWORD' ? (isPasswordVisible ? 'text' : 'password') : 'text'}
              autoComplete={form.authType === 'PASSWORD' ? 'current-password' : 'off'}
              value={form.secretRef ?? ''}
              onChange={(event) => patchForm({ secretRef: event.target.value })}
              placeholder={t(`omnibox.${form.authType === 'PASSWORD' ? 'password_placeholder' : 'keypair_placeholder'}`)}
              className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">{t('omnibox.description')}</label>
          <textarea
            value={form.description ?? ''}
            onChange={(event) => patchForm({ description: event.target.value })}
            placeholder={t('omnibox.description_placeholder')}
            rows={3}
            className="w-full resize-none rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-[var(--app-text-base)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
            >
              {t('omnibox.cancel')}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!isValid}
            className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-[var(--app-text-base)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('omnibox.save')}
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={handleConnect}
            className="rounded-[18px] px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--app-accent-bg)' }}
          >
            {t('omnibox.connect')}
          </button>
        </div>
      </div>
    </form>
  );
}
