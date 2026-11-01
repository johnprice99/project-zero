//! The board file.
//!
//! The frontend owns the board format and validation; this module stores it safely:
//! - every write replaces the file atomically (write a temporary file, flush, rename),
//! - a revision number refuses writes based on an out-of-date board,
//! - an unreadable board file is never replaced.

use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const BOARD_FILE: &str = "board.json";

#[derive(Debug, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ErrorKind {
    Conflict,
    Invalid,
    Io,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct StorageError {
    pub kind: ErrorKind,
    pub message: String,
}

impl StorageError {
    fn invalid(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Invalid,
            message: message.into(),
        }
    }
    fn io(action: &str, error: std::io::Error) -> Self {
        Self {
            kind: ErrorKind::Io,
            message: format!("{action}: {error}"),
        }
    }
    fn conflict() -> Self {
        Self {
            kind: ErrorKind::Conflict,
            message: "This board was changed elsewhere since it was loaded.".into(),
        }
    }
}

type Result<T> = std::result::Result<T, StorageError>;

#[derive(Serialize)]
struct Envelope<'a> {
    app: &'static str,
    revision: u64,
    #[serde(rename = "savedAt")]
    saved_at: u64,
    board: &'a RawValue,
}

#[derive(Deserialize)]
struct StoredEnvelope<'a> {
    revision: u64,
    #[serde(borrow)]
    board: &'a RawValue,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct LoadedBoard {
    pub revision: u64,
    pub contents: String,
}

pub struct Storage {
    dir: PathBuf,
    /// `None` until the board has been read successfully.
    revision: Mutex<Option<u64>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Replace `path` so that a crash leaves either the old or the new file, never a mix.
fn write_atomic(path: &Path, contents: &[u8]) -> Result<()> {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("board");
    let temporary = path.with_file_name(format!(".{name}.tmp"));
    let write = || -> std::io::Result<()> {
        let mut file = File::create(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        if let Some(parent) = path.parent() {
            // Persist the rename itself. Not every platform can sync a directory.
            let _ = File::open(parent).and_then(|dir| dir.sync_all());
        }
        Ok(())
    };
    write().map_err(|error| {
        let _ = fs::remove_file(&temporary);
        StorageError::io("The board could not be saved", error)
    })
}

impl Storage {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            revision: Mutex::new(None),
        }
    }

    fn board_path(&self) -> PathBuf {
        self.dir.join(BOARD_FILE)
    }
    fn revision(&self) -> std::sync::MutexGuard<'_, Option<u64>> {
        // A panic while holding the lock cannot leave the file half-written, so recover.
        self.revision
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn load(&self) -> Result<Option<LoadedBoard>> {
        let mut revision = self.revision();
        *revision = None;
        let raw = match fs::read_to_string(self.board_path()) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                *revision = Some(0);
                return Ok(None);
            }
            Err(error) => {
                return Err(StorageError::io(
                    "The saved board could not be opened",
                    error,
                ))
            }
        };
        let envelope: StoredEnvelope = serde_json::from_str(&raw).map_err(|_| {
            StorageError::invalid(format!(
                "The saved board file could not be read. It has not been changed: {}",
                self.board_path().display()
            ))
        })?;
        *revision = Some(envelope.revision);
        Ok(Some(LoadedBoard {
            revision: envelope.revision,
            contents: envelope.board.get().to_owned(),
        }))
    }

    pub fn save(&self, expected_revision: u64, contents: &str) -> Result<u64> {
        let board: &RawValue = serde_json::from_str(contents)
            .map_err(|_| StorageError::invalid("The board is not valid JSON."))?;
        let mut revision = self.revision();
        match *revision {
            None => {
                return Err(StorageError::invalid(
                    "The saved board has not been loaded.",
                ))
            }
            Some(current) if current != expected_revision => return Err(StorageError::conflict()),
            Some(_) => {}
        }
        fs::create_dir_all(&self.dir)
            .map_err(|e| StorageError::io("The data folder could not be created", e))?;
        let next = expected_revision + 1;
        let envelope = Envelope {
            app: "project-zero",
            revision: next,
            saved_at: now_ms(),
            board,
        };
        let json = serde_json::to_vec(&envelope)
            .map_err(|_| StorageError::invalid("The board could not be encoded."))?;
        write_atomic(&self.board_path(), &json)?;
        *revision = Some(next);
        Ok(next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let n = NEXT.fetch_add(1, Ordering::SeqCst);
            let dir =
                std::env::temp_dir().join(format!("project-zero-test-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            Self(dir)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn board(title: &str) -> String {
        format!(r#"{{"schema":1,"title":"{title}"}}"#)
    }

    #[test]
    fn saves_and_reloads_with_increasing_revisions() {
        let dir = TempDir::new();
        let storage = Storage::new(dir.0.clone());
        assert_eq!(storage.load().unwrap(), None);
        assert_eq!(storage.save(0, &board("first")).unwrap(), 1);
        assert_eq!(storage.save(1, &board("second")).unwrap(), 2);
        let reopened = Storage::new(dir.0.clone());
        assert_eq!(
            reopened.load().unwrap(),
            Some(LoadedBoard {
                revision: 2,
                contents: board("second")
            })
        );
        assert!(!dir.0.join(".board.json.tmp").exists());
    }

    #[test]
    fn refuses_saves_based_on_an_old_revision() {
        let dir = TempDir::new();
        let storage = Storage::new(dir.0.clone());
        storage.load().unwrap();
        storage.save(0, &board("first")).unwrap();
        let error = storage.save(0, &board("stale")).unwrap_err();
        assert_eq!(error.kind, ErrorKind::Conflict);
        assert_eq!(storage.load().unwrap().unwrap().contents, board("first"));
    }

    #[test]
    fn refuses_saves_before_loading_and_invalid_json() {
        let dir = TempDir::new();
        let storage = Storage::new(dir.0.clone());
        assert_eq!(
            storage.save(0, &board("x")).unwrap_err().kind,
            ErrorKind::Invalid
        );
        storage.load().unwrap();
        assert_eq!(
            storage.save(0, "{not json").unwrap_err().kind,
            ErrorKind::Invalid
        );
        assert!(!dir.0.join(BOARD_FILE).exists());
    }

    #[test]
    fn never_replaces_an_unreadable_board() {
        let dir = TempDir::new();
        fs::create_dir_all(&dir.0).unwrap();
        fs::write(dir.0.join(BOARD_FILE), "{damaged").unwrap();
        let storage = Storage::new(dir.0.clone());
        let error = storage.load().unwrap_err();
        assert_eq!(error.kind, ErrorKind::Invalid);
        assert!(error.message.contains("board.json"), "names the file");
        assert!(storage.save(0, &board("x")).is_err());
        assert_eq!(
            fs::read_to_string(dir.0.join(BOARD_FILE)).unwrap(),
            "{damaged"
        );
    }
}
