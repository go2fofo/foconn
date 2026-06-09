/*
 * @Author: fofo
 * @Date: 2026-06-08 14:03:20
 * @LastEditTime: 2026-06-08 14:03:21
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/components/FloatingMenu.tsx
 */
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerConnection } from '../types';
import { Menu, Home, Server, X } from 'lucide-react';

interface FloatingMenuProps {
  connections: ServerConnection[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onDisconnect: (id: string) => void;
}

export function FloatingMenu({ connections, activeId, onSelect, onDisconnect }: FloatingMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Only show floating menu if we are NOT on home page (activeId != null)
  if (!activeId) return null;

  return (
    <div className="absolute left-2 top-2 z-50" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
        style={{ background: 'var(--app-accent-bg)' }}
      >
        <Menu size={16} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-10 mt-2 flex w-64 flex-col gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-container)] py-2 shadow-xl">
          <button
            onClick={() => { onSelect(null); setIsOpen(false); }}
            className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-bg-hover)] hover:text-white"
          >
            <Home size={16} className="text-[var(--app-info)]" />
            {t('menu.home')}
          </button>
          
          <div className="my-1 h-px bg-[var(--app-border)]"></div>
          
          <div className="px-4 py-1 text-xs font-semibold text-[var(--app-text-soft)]">
            {t('menu.active_connections')}
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {connections.map(conn => (
              <div 
                key={conn.id}
                className={`flex items-center justify-between px-4 py-2 group cursor-pointer transition-colors ${
                  activeId === conn.id
                    ? 'bg-[var(--app-bg-hover)] text-white'
                    : 'text-[var(--app-text-muted)] hover:bg-[var(--app-bg-hover)]'
                }`}
                onClick={() => { onSelect(conn.id); setIsOpen(false); }}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Server size={16} className={activeId === conn.id ? 'text-[var(--app-success)]' : 'text-[var(--app-text-soft)]'} />
                  <span className="text-sm truncate">{conn.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDisconnect(conn.id);
                    if (connections.length === 1) setIsOpen(false);
                  }}
                  className="rounded p-1 text-[var(--app-text-soft)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--app-bg-danger-soft)] hover:text-[var(--app-error)]"
                  title={t('menu.disconnect')}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
