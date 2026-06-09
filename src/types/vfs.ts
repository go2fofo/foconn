/*
 * @Author: fofo
 * @Date: 2026-06-08 13:50:30
 * @LastEditTime: 2026-06-08 13:50:31
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/types/vfs.ts
 */
// VFS Data Models
export interface VfsNode {
  name: string;          
  path: string;          
  is_dir: boolean;       
  is_symlink: boolean;   
  size: number;          
  mtime: number;         
  permissions: {
    mode: number;        
    readable: boolean;
    writable: boolean;
    executable: boolean;
  };
  owner?: string;        
  group?: string;        
}

export type TransferDirection = 'UPLOAD' | 'DOWNLOAD';
export type TaskStatus = 'PENDING' | 'TRANSFERRING' | 'PAUSED' | 'COMPLETED' | 'FAILED';

export interface TransferProgress {
  task_id: string;       
  bytes_transferred: number; 
  bytes_total: number;   
  speed_bps: number;     
  status: TaskStatus;
  error_message?: string;
  filename: string;
  path: string;
  direction: TransferDirection;
}

export interface VfsTransferEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}
