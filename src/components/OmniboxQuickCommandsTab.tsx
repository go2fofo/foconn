import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuickCommandItem, QuickCommandScope } from '../types';
import { useWorkspaceStore } from '../store/workspaceStore';
import { AppSelect } from './AppSelect';

interface OmniboxQuickCommandsTabProps {
  keyword: string;
}

function createEmptyQuickCommand(): QuickCommandItem {
  return {
    id: '',
    title: '',
    description: '',
    scope: 'LOCAL',
    command: '',
    tags: [],
    updatedAt: Date.now(),
  };
}

export function OmniboxQuickCommandsTab({ keyword }: OmniboxQuickCommandsTabProps) {
  const { t } = useTranslation();
  const quickCommands = useWorkspaceStore((state) => state.quickCommands);
  const quickCommandEditor = useWorkspaceStore((state) => state.quickCommandEditor);
  const setQuickCommandEditor = useWorkspaceStore((state) => state.setQuickCommandEditor);
  const saveQuickCommand = useWorkspaceStore((state) => state.saveQuickCommand);
  const deleteQuickCommand = useWorkspaceStore((state) => state.deleteQuickCommand);
  const [form, setForm] = useState<QuickCommandItem>(createEmptyQuickCommand());
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (!quickCommandEditor) {
      setForm(createEmptyQuickCommand());
      setTagsInput('');
      return;
    }

    setForm({
      ...quickCommandEditor,
      description: quickCommandEditor.description ?? '',
      tags: quickCommandEditor.tags ?? [],
    });
    setTagsInput((quickCommandEditor.tags ?? []).join(', '));
  }, [quickCommandEditor]);

  const scopeOptions = useMemo(
    () => [
      {
        value: 'LOCAL',
        label: t('omnibox.quick_command_scope_local'),
        description: t('omnibox.quick_command_scope_local_desc'),
      },
      {
        value: 'REMOTE',
        label: t('omnibox.quick_command_scope_remote'),
        description: t('omnibox.quick_command_scope_remote_desc'),
      },
    ],
    [t],
  );

  const filteredPresets = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return quickCommands;
    return quickCommands.filter((preset) =>
      `${preset.title} ${preset.description} ${preset.scope} ${preset.command} ${preset.tags.join(' ')}`.toLowerCase().includes(query),
    );
  }, [keyword, quickCommands]);

  const patchForm = (patch: Partial<QuickCommandItem>) => {
    setForm((current) => ({
      ...current,
      ...patch,
    }));
  };

  const resetEditor = () => {
    setQuickCommandEditor(null);
    setForm(createEmptyQuickCommand());
    setTagsInput('');
  };

  const handleSave = async () => {
    const nextCommand: QuickCommandItem = {
      ...form,
      description: form.description?.trim() || undefined,
      title: form.title.trim(),
      command: form.command.trim(),
      tags: tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      updatedAt: form.updatedAt || Date.now(),
    };

    if (!nextCommand.title || !nextCommand.command) {
      return;
    }

    await saveQuickCommand(nextCommand);
    resetEditor();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
      <div className="space-y-4">
        <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
              {t('omnibox.quick_commands_overview')}
            </div>
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-[12px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-3 py-1.5 text-xs text-[var(--app-text-base)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
            >
              {t('omnibox.quick_command_add')}
            </button>
          </div>
          <div className="space-y-3 text-sm text-[var(--app-text-muted)]">
            <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3">
              {t('omnibox.quick_commands_persist_hint')}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">
                  {t('omnibox.quick_commands_total')}
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{quickCommands.length}</div>
              </div>
              <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--app-text-soft)]">
                  {t('omnibox.quick_commands_scope_split')}
                </div>
                <div className="mt-2 text-sm text-white">
                  {quickCommands.filter((item) => item.scope === 'LOCAL').length} {t('omnibox.quick_command_scope_local')}
                  {' / '}
                  {quickCommands.filter((item) => item.scope === 'REMOTE').length} {t('omnibox.quick_command_scope_remote')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
            {t('omnibox.quick_commands_list')}
          </div>
          <div className="space-y-3">
            {filteredPresets.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-3 py-6 text-center text-sm text-[var(--app-text-soft)]">
                {t('omnibox.no_quick_commands')}
              </div>
            ) : (
              filteredPresets.map((preset) => (
                <div key={preset.id} className="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-bg-input)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{preset.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-[var(--app-text-muted)]">{preset.description || t('omnibox.no_description')}</div>
                    </div>
                    <div className="rounded-full border border-[var(--app-border)] px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--app-info)]">
                      {preset.scope === 'LOCAL' ? t('omnibox.quick_command_scope_local') : t('omnibox.quick_command_scope_remote')}
                    </div>
                  </div>
                  <div className="mt-3 rounded-[16px] border border-[var(--app-border)] bg-[var(--app-bg-container)] px-4 py-3 font-mono text-xs leading-6 text-[var(--app-text-base)]">
                    {preset.command}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {preset.tags.length > 0 ? (
                      preset.tags.map((tag) => (
                        <span
                          key={`${preset.id}-${tag}`}
                          className="rounded-full border border-[var(--app-border)] bg-[var(--app-bg-hover)] px-2 py-1 text-[11px] text-[var(--app-text-muted)]"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--app-text-soft)]">{t('omnibox.no_tags')}</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickCommandEditor(preset)}
                      className="rounded-[12px] border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
                    >
                      {t('omnibox.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(t('omnibox.quick_command_delete_confirm'))) {
                          return;
                        }
                        void deleteQuickCommand(preset.id);
                      }}
                      className="rounded-[12px] border border-[var(--app-border-danger)] px-3 py-1.5 text-xs text-[var(--app-error)] transition hover:bg-[var(--app-bg-danger-soft)]"
                    >
                      {t('omnibox.delete')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] p-5">
          <div className="mb-4 text-xs uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
            {t('omnibox.quick_commands_overview')}
          </div>
          <div className="mb-5">
            <div className="text-lg font-semibold text-white">
              {quickCommandEditor ? t('omnibox.quick_command_editing') : t('omnibox.quick_command_creating')}
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)]">
              {t('omnibox.quick_commands_tab_hint')}
            </div>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm text-[var(--app-text-muted)]">
              <span>{t('omnibox.quick_command_title')}</span>
              <input
                value={form.title}
                onChange={(event) => patchForm({ title: event.target.value })}
                placeholder={t('omnibox.quick_command_title_placeholder')}
                className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              <label className="grid gap-2 text-sm text-[var(--app-text-muted)]">
                <span>{t('omnibox.quick_command_scope')}</span>
                <AppSelect
                  value={form.scope}
                  options={scopeOptions}
                  onChange={(value) => patchForm({ scope: value as QuickCommandScope })}
                />
              </label>

              <label className="grid gap-2 text-sm text-[var(--app-text-muted)]">
                <span>{t('omnibox.quick_command_tags')}</span>
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder={t('omnibox.quick_command_tags_placeholder')}
                  className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-[var(--app-text-muted)]">
              <span>{t('omnibox.description')}</span>
              <textarea
                value={form.description ?? ''}
                onChange={(event) => patchForm({ description: event.target.value })}
                placeholder={t('omnibox.quick_command_description_placeholder')}
                rows={3}
                className="resize-none rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
              />
            </label>

            <label className="grid gap-2 text-sm text-[var(--app-text-muted)]">
              <span>{t('omnibox.quick_command_content')}</span>
              <textarea
                value={form.command}
                onChange={(event) => patchForm({ command: event.target.value })}
                placeholder={t('omnibox.quick_command_content_placeholder')}
                rows={10}
                className="resize-y rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-[var(--app-primary)]"
              />
            </label>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-[14px] border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)] hover:text-white"
            >
              {t('omnibox.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!form.title.trim() || !form.command.trim()}
              className="rounded-[14px] border border-[var(--app-border-strong)] bg-[var(--app-bg-hover)] px-4 py-2 text-sm text-white transition hover:bg-[var(--app-bg-hover-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('omnibox.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
