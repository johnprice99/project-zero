import { ConflictError, type StorageBackend } from './storage.ts';

// Browser preview storage. Not durable: clearing site data removes it.
const KEY = 'project-zero.board';
const BEFORE_RESTORE_KEY = 'project-zero.board.before-restore';
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

function envelope(revision: number, contents: string): string {
  return `{"revision":${revision},"savedAt":${Date.now()},"board":${contents}}`;
}
function storedRevision(raw: string | null): number {
  if (raw === null) return 0;
  const revision = (JSON.parse(raw) as { revision?: unknown }).revision;
  if (typeof revision !== 'number') throw new Error('The saved board could not be read.');
  return revision;
}

export function createBrowserBackend(storage: StorageAccess): StorageBackend {
  return {
    async load() {
      const raw = storage.getItem(KEY);
      if (raw === null) return null;
      const saved = JSON.parse(raw) as { revision?: unknown; board?: unknown };
      if (typeof saved.revision !== 'number') throw new Error('The saved board could not be read.');
      return { revision: saved.revision, contents: JSON.stringify(saved.board) };
    },
    async save(expectedRevision, contents) {
      if (storedRevision(storage.getItem(KEY)) !== expectedRevision) {
        throw new ConflictError('This board was changed in another window.');
      }
      storage.setItem(KEY, envelope(expectedRevision + 1, contents));
      return expectedRevision + 1;
    },
    async replace(contents) {
      const current = storage.getItem(KEY);
      let revision = 0;
      if (current !== null) {
        storage.setItem(BEFORE_RESTORE_KEY, current);
        try {
          revision = storedRevision(current);
        } catch {
          // An unreadable board is kept in BEFORE_RESTORE_KEY and replaced.
        }
      }
      storage.setItem(KEY, envelope(revision + 1, contents));
      return revision + 1;
    },
    async listBackups() {
      return [];
    },
    async readBackup() {
      throw new Error('Backups are only available in the desktop app.');
    },
    async exportFile(fileName, contents) {
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
    importFile() {
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('cancel', () => resolve(null));
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) resolve(null);
          else file.text().then(resolve, reject);
        });
        input.click();
      });
    },
  };
}
