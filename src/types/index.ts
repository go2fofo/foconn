/*
 * @Author: fofo
 * @Date: 2026-06-08 13:36:01
 * @LastEditTime: 2026-06-10 11:45:28
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/types/index.ts
 */
export * from './vfs';

export type ProtocolType = 'TERMINAL' | 'DASHBOARD'| 'SSH' | 'SFTP' | 'FTP' | 'TELNET' | 'SERIAL' | 'RDP' | 'VNC' | 'SPICE' ;
export type WorkspaceProtocol = 'DASHBOARD' | 'TERMINAL' | 'SSH' | 'SFTP' | 'RDP' | 'VNC' ;
export type QuickConnectProtocol = Exclude<WorkspaceProtocol, 'DASHBOARD' | 'TERMINAL'>;
export type AuthType = 'PASSWORD' | 'KEYPAIR';
export type QuickCommandScope = 'LOCAL' | 'REMOTE';

export interface ServerConnection {
  id: string;             // UUID v4
  name: string;           // 会话别名
  host: string;           // 远程主机 IP / 域名
  port: number;           // 端口号
  username?: string;
  authType?: AuthType;
  secretRef?: string;
  description?: string;
  activeTab: 'SSH' | 'SFTP';
}

export interface SessionConfig {
  id: string;             // UUID v4
  name: string;           // 会话别名
  protocol: ProtocolType; // 协议类别
  host?: string;          // 远程主机 IP / 域名
  port?: number;          // 端口号
  auth?: {
    method: 'anonymous' | 'password' | 'keyfile' | 'hardware';
    username?: string;
    secret_ref?: string;  
  };
  meta: Record<string, any>; 
}

export interface BookmarkItem {
  id: string;
  name: string;
  protocol: 'SSH' | 'SFTP';
  host: string;
  port: number;
  username?: string;
  description?: string;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  is_system: boolean;
}

export interface SshSessionConfig {
  id: string;
  groupId: string;
  title: string;
  protocol: 'SSH' | 'SFTP';
  host: string;
  port: number;
  username?: string;
  authType: AuthType;
  secretRef?: string;
  description?: string;
  updatedAt: number;
}

export interface BookmarkGroupWithItems {
  group: BookmarkGroup;
  items: SshSessionConfig[];
}

export interface HistoryItem {
  id: string;
  name: string;
  protocol: WorkspaceProtocol;
  host?: string;
  port?: number;
  username?: string;
  openedAt: number;
  description?: string;
}

export interface QuickCommandItem {
  id: string;
  title: string;
  description?: string;
  scope: QuickCommandScope;
  command: string;
  tags: string[];
  updatedAt: number;
}

export interface WorkspaceTabInstance {
  id: string;
  title: string;
  protocol: WorkspaceProtocol;
  sessionId: string | null;
  closable: boolean;
  session?: SessionConfig;
  connection?: ServerConnection;
}
