/*
 * @Author: fofo
 * @Date: 2026-06-08 14:02:59
 * @LastEditTime: 2026-06-08 14:03:00
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/components/ServerView.tsx
 */
import { ServerConnection, SessionConfig } from '../types';
import { Terminal } from './Terminal';
import { VfsPanel } from './VfsPanel';
import { Terminal as TerminalIcon, FolderOpen } from 'lucide-react';
import { useMemo } from 'react';

interface ServerViewProps {
  connection: ServerConnection;
  onTabChange: (tab: 'SSH' | 'SFTP') => void;
}

export function ServerView({ connection, onTabChange }: ServerViewProps) {
  const sshSession = useMemo<SessionConfig>(() => ({
    id: `${connection.id}_ssh`,
    name: connection.name,
    protocol: 'SSH',
    host: connection.host,
    port: connection.port,
    auth: {
      method: connection.authType === 'KEYPAIR' ? 'keyfile' : 'password',
      username: connection.username,
      secret_ref: connection.secretRef,
    },
    meta: {
      description: connection.description,
    }
  }), [connection]);

  const sftpSession = useMemo<SessionConfig>(() => ({
    id: `${connection.id}_sftp`,
    name: connection.name,
    protocol: 'SFTP',
    host: connection.host,
    port: connection.port,
    auth: {
      method: connection.authType === 'KEYPAIR' ? 'keyfile' : 'password',
      username: connection.username,
      secret_ref: connection.secretRef,
    },
    meta: {
      description: connection.description,
    }
  }), [connection]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--app-bg-base)]">
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--app-border)] bg-[var(--app-bg-container)] px-2">
        <div className="mr-4 flex items-center border-r border-[var(--app-border)] pr-4 pl-12 text-sm font-semibold text-[var(--app-text-muted)]">
          {connection.name}
        </div>
        <button
          onClick={() => onTabChange('SSH')}
          className={`mx-1 flex h-8 items-center gap-2 rounded-t-xl border px-4 transition ${
            connection.activeTab === 'SSH'
              ? 'border-[rgba(68,150,255,0.28)] bg-[linear-gradient(180deg,rgba(68,150,255,0.18),rgba(68,150,255,0.06))] text-white shadow-[inset_0_-2px_0_0_rgba(68,150,255,0.95)]'
              : 'border-transparent bg-[rgba(255,255,255,0.04)] text-[var(--app-text-muted)] hover:bg-[var(--app-bg-hover)]'
          }`}
        >
          <TerminalIcon
            size={14}
            className={connection.activeTab === 'SSH' ? 'text-[#6db7ff]' : 'text-[var(--app-primary)]'}
          />
          SSH
        </button>
        <button
          onClick={() => onTabChange('SFTP')}
          className={`mx-1 flex h-8 items-center gap-2 rounded-t-xl border px-4 transition ${
            connection.activeTab === 'SFTP'
              ? 'border-[rgba(72,188,152,0.28)] bg-[linear-gradient(180deg,rgba(72,188,152,0.18),rgba(72,188,152,0.06))] text-white shadow-[inset_0_-2px_0_0_rgba(72,188,152,0.95)]'
              : 'border-transparent bg-[rgba(255,255,255,0.04)] text-[var(--app-text-muted)] hover:bg-[var(--app-bg-hover)]'
          }`}
        >
          <FolderOpen
            size={14}
            className={connection.activeTab === 'SFTP' ? 'text-[#61dfbf]' : 'text-[var(--app-info)]'}
          />
          SFTP
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {connection.activeTab === 'SSH' ? (
          <Terminal session={sshSession} isActive />
        ) : (
          <VfsPanel session={sftpSession} />
        )}
      </div>
    </div>
  );
}
