/*
 * @Author: fofo
 * @Date: 2026-06-08 14:02:08
 * @LastEditTime: 2026-06-08 14:02:10
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/components/StatusBar.tsx
 */
import { useTranslation } from 'react-i18next';
import { Globe, Activity, TerminalSquare } from 'lucide-react';

export function StatusBar() {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  return (
    <div className="z-50 flex h-7 shrink-0 items-center justify-between border-t border-[var(--app-border)] bg-[var(--app-bg-container)] px-3 text-xs text-[var(--app-text-base)] select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <TerminalSquare size={12} />
          <span>Foconn</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity size={12} />
          <span>{t('status.ready')}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleLanguage}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--app-bg-hover)]"
          title={t('status.language')}
        >
          <Globe size={12} />
          <span>{i18n.language === 'zh' ? '中文' : 'EN'}</span>
        </button>
        <div className="opacity-80">v0.1.0</div>
      </div>
    </div>
  );
}
