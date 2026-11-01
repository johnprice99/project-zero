import { invoke } from '@tauri-apps/api/core';
import { ConflictError, type BackupInfo, type StorageBackend } from './storage.ts';

// Desktop storage. Rust owns the file: atomic replacement, revision checks, and backups
// (see src-tauri/src/storage.rs). The webview has no direct file access.
interface RustError {
  kind: 'conflict' | 'invalid' | 'io';
  message: string;
}
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const failure = error as Partial<RustError> | string;
    if (typeof failure === 'string') throw new Error(failure);
    if (failure?.kind === 'conflict') throw new ConflictError(failure.message);
    throw new Error(failure?.message || 'The board could not be saved.');
  }
}

export function createTauriBackend(): StorageBackend {
  return {
    load: () => call('load_board'),
    save: (expectedRevision, contents) => call('save_board', { expectedRevision, contents }),
    replace: contents => call('replace_board', { contents }),
    listBackups: () => call<BackupInfo[]>('list_backups'),
    readBackup: id => call('read_backup', { id }),
    exportFile: (fileName, contents) => call('export_board', { fileName, contents }),
    importFile: () => call('import_board'),
  };
}
