//! The board file and its backups.
//!
//! The frontend owns the board format and validation; this module stores it safely:
//! - every write replaces the file atomically (write a temporary file, flush, rename),
//! - a revision number refuses writes based on an out-of-date board,
//! - the previous file is backed up before the first save of each session and then
//!   at most every 30 minutes, and before any restore,
//! - an unreadable board file is never replaced except by an explicit restore.

use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const BOARD_FILE: &str = "board.json";
const BACKUP_DIR: &str = "backups";
const BACKUP_INTERVAL_MS: u64 = 30 * 60 * 1000;
const KEEP_RECENT_BACKUPS: usize = 20;
const KEEP_DAILY_BACKUPS_FOR_DAYS: u64 = 60;
const DAY_MS: u64 = 24 * 60 * 60 * 1000;
pub const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;

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
    pub fn invalid(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Invalid,
            message: message.into(),
        }
    }
    pub fn io(action: &str, error: std::io::Error) -> Self {
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

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub saved_at: u64,
    pub reason: String,
}

struct State {
    /// `None` until the board has been read successfully.
    revision: Option<u64>,
    last_backup: Option<u64>,
}

pub struct Storage {
    dir: PathBuf,
    state: Mutex<State>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_board(contents: &str) -> Result<&RawValue> {
    serde_json::from_str(contents)
        .map_err(|_| StorageError::invalid("The board is not valid JSON."))
}

/// Replace `path` so that a crash leaves either the old or the new file, never a mix.
pub fn write_atomic(path: &Path, contents: &[u8]) -> Result<()> {
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
        StorageError::io("The file could not be saved", error)
    })
}

/// Backup ids look like `board-1730000000000-opened`.
fn parse_backup_id(id: &str) -> Option<(u64, &str)> {
    let rest = id.strip_prefix("board-")?;
    let (time, reason) = rest.split_once('-')?;
    let valid_reason =
        !reason.is_empty() && reason.chars().all(|c| c.is_ascii_lowercase() || c == '-');
    let valid_time = !time.is_empty() && time.chars().all(|c| c.is_ascii_digit());
    if valid_reason && valid_time {
        Some((time.parse().ok()?, reason))
    } else {
        None
    }
}

/// Keep the newest backups, plus the newest backup of each earlier day for a while.
/// `backups` must be sorted newest first.
pub fn backups_to_delete(backups: &[BackupInfo], now: u64) -> Vec<String> {
    let mut kept_days = HashSet::new();
    let oldest_daily = now.saturating_sub(KEEP_DAILY_BACKUPS_FOR_DAYS * DAY_MS);
    let mut delete = Vec::new();
    for (index, backup) in backups.iter().enumerate() {
        let day = backup.saved_at / DAY_MS;
        let recent = index < KEEP_RECENT_BACKUPS;
        let daily = backup.saved_at >= oldest_daily && !kept_days.contains(&day);
        if recent || daily {
            kept_days.insert(day);
        } else {
            delete.push(backup.id.clone());
        }
    }
    delete
}

impl Storage {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            state: Mutex::new(State {
                revision: None,
                last_backup: None,
            }),
        }
    }

    fn board_path(&self) -> PathBuf {
        self.dir.join(BOARD_FILE)
    }
    fn backup_dir(&self) -> PathBuf {
        self.dir.join(BACKUP_DIR)
    }
    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        // A panic while holding the lock cannot leave the file half-written, so recover.
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn load(&self) -> Result<Option<LoadedBoard>> {
        let mut state = self.state();
        state.revision = None;
        let raw = match fs::read_to_string(self.board_path()) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                state.revision = Some(0);
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
        state.revision = Some(envelope.revision);
        Ok(Some(LoadedBoard {
            revision: envelope.revision,
            contents: envelope.board.get().to_owned(),
        }))
    }

    pub fn save(&self, expected_revision: u64, contents: &str) -> Result<u64> {
        let board = parse_board(contents)?;
        let mut state = self.state();
        match state.revision {
            None => {
                return Err(StorageError::invalid(
                    "The saved board has not been loaded.",
                ))
            }
            Some(revision) if revision != expected_revision => return Err(StorageError::conflict()),
            Some(_) => {}
        }
        let now = now_ms();
        let reason = match state.last_backup {
            None => Some("opened"),
            Some(last) if now.saturating_sub(last) >= BACKUP_INTERVAL_MS => Some("interval"),
            Some(_) => None,
        };
        if let Some(reason) = reason {
            self.backup_current(reason, now)?;
            state.last_backup = Some(now);
        }
        let revision = expected_revision + 1;
        self.write_board(revision, board, now)?;
        state.revision = Some(revision);
        Ok(revision)
    }

    /// Replace the board for a restore, whatever state the current file is in.
    pub fn replace(&self, contents: &str) -> Result<u64> {
        let board = parse_board(contents)?;
        let mut state = self.state();
        let now = now_ms();
        self.backup_current("restore", now)?;
        state.last_backup = Some(now);
        let revision = state.revision.unwrap_or(0) + 1;
        self.write_board(revision, board, now)?;
        state.revision = Some(revision);
        Ok(revision)
    }

    fn write_board(&self, revision: u64, board: &RawValue, now: u64) -> Result<()> {
        fs::create_dir_all(&self.dir)
            .map_err(|e| StorageError::io("The data folder could not be created", e))?;
        let envelope = Envelope {
            app: "project-zero",
            revision,
            saved_at: now,
            board,
        };
        let json = serde_json::to_vec(&envelope)
            .map_err(|_| StorageError::invalid("The board could not be encoded."))?;
        write_atomic(&self.board_path(), &json)
    }

    /// Copy the current board file, if there is one, into the backups folder.
    fn backup_current(&self, reason: &str, now: u64) -> Result<()> {
        let contents = match fs::read(self.board_path()) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(StorageError::io("The board could not be backed up", error)),
        };
        let dir = self.backup_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| StorageError::io("The backup folder could not be created", e))?;
        let mut time = now;
        while dir.join(format!("board-{time}-{reason}.json")).exists() {
            time += 1;
        }
        write_atomic(&dir.join(format!("board-{time}-{reason}.json")), &contents)?;
        self.prune_backups(now);
        Ok(())
    }

    fn prune_backups(&self, now: u64) {
        let Ok(backups) = self.list_backups() else {
            return;
        };
        for id in backups_to_delete(&backups, now) {
            let _ = fs::remove_file(self.backup_dir().join(format!("{id}.json")));
        }
    }

    pub fn list_backups(&self) -> Result<Vec<BackupInfo>> {
        let entries = match fs::read_dir(self.backup_dir()) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(StorageError::io("The backups could not be listed", error)),
        };
        let mut backups: Vec<BackupInfo> = entries
            .filter_map(|entry| {
                let name = entry.ok()?.file_name().into_string().ok()?;
                let id = name.strip_suffix(".json")?;
                let (saved_at, reason) = parse_backup_id(id)?;
                Some(BackupInfo {
                    id: id.to_owned(),
                    saved_at,
                    reason: reason.to_owned(),
                })
            })
            .collect();
        backups.sort_by(|a, b| b.saved_at.cmp(&a.saved_at).then_with(|| b.id.cmp(&a.id)));
        Ok(backups)
    }

    /// Returns the board document inside a backup.
    pub fn read_backup(&self, id: &str) -> Result<String> {
        if parse_backup_id(id).is_none() {
            return Err(StorageError::invalid("That backup does not exist."));
        }
        let raw = fs::read_to_string(self.backup_dir().join(format!("{id}.json")))
            .map_err(|e| StorageError::io("The backup could not be opened", e))?;
        let envelope: StoredEnvelope = serde_json::from_str(&raw)
            .map_err(|_| StorageError::invalid("This backup could not be read."))?;
        Ok(envelope.board.get().to_owned())
    }
}

/// Write an export chosen by the user. The contents must be valid JSON.
pub fn export_to(path: &Path, contents: &str) -> Result<()> {
    parse_board(contents)?;
    write_atomic(path, contents.as_bytes())
}

pub fn read_import(path: &Path) -> Result<String> {
    let size = fs::metadata(path)
        .map_err(|e| StorageError::io("The file could not be opened", e))?
        .len();
    if size > MAX_IMPORT_BYTES {
        return Err(StorageError::invalid(
            "That file is too large to be a Project Zero board.",
        ));
    }
    fs::read_to_string(path).map_err(|e| StorageError::io("The file could not be read", e))
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
    fn backups(storage: &Storage) -> Vec<String> {
        storage
            .list_backups()
            .unwrap()
            .into_iter()
            .map(|b| b.reason)
            .collect()
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
    fn never_replaces_an_unreadable_board_except_by_restore() {
        let dir = TempDir::new();
        fs::create_dir_all(&dir.0).unwrap();
        fs::write(dir.0.join(BOARD_FILE), "{damaged").unwrap();
        let storage = Storage::new(dir.0.clone());
        assert_eq!(storage.load().unwrap_err().kind, ErrorKind::Invalid);
        assert!(storage.save(0, &board("x")).is_err());
        assert_eq!(
            fs::read_to_string(dir.0.join(BOARD_FILE)).unwrap(),
            "{damaged"
        );

        assert_eq!(storage.replace(&board("restored")).unwrap(), 1);
        assert_eq!(storage.load().unwrap().unwrap().contents, board("restored"));
        let backup = &storage.list_backups().unwrap()[0];
        assert_eq!(backup.reason, "restore");
        let kept =
            fs::read_to_string(dir.0.join(BACKUP_DIR).join(format!("{}.json", backup.id))).unwrap();
        assert_eq!(kept, "{damaged");
    }

    #[test]
    fn backs_up_before_the_first_save_of_a_session_only() {
        let dir = TempDir::new();
        let storage = Storage::new(dir.0.clone());
        storage.load().unwrap();
        storage.save(0, &board("first")).unwrap();
        assert!(
            backups(&storage).is_empty(),
            "nothing to back up on first launch"
        );
        storage.save(1, &board("second")).unwrap();
        assert!(backups(&storage).is_empty());

        let next_session = Storage::new(dir.0.clone());
        next_session.load().unwrap();
        next_session.save(2, &board("third")).unwrap();
        next_session.save(3, &board("fourth")).unwrap();
        assert_eq!(backups(&next_session), ["opened"]);
        let id = &next_session.list_backups().unwrap()[0].id;
        assert_eq!(next_session.read_backup(id).unwrap(), board("second"));
    }

    #[test]
    fn backup_ids_cannot_reach_other_files() {
        let dir = TempDir::new();
        let storage = Storage::new(dir.0.clone());
        for id in [
            "../board",
            "board-1-../../x",
            "board-1-opened/../../board",
            "board--opened",
            "board-1-",
        ] {
            assert_eq!(
                storage.read_backup(id).unwrap_err().kind,
                ErrorKind::Invalid,
                "{id}"
            );
        }
    }

    #[test]
    fn pruning_keeps_recent_backups_and_one_per_day() {
        let now = 100 * DAY_MS;
        let mut list: Vec<BackupInfo> = (0..90u64)
            .flat_map(|day| {
                (0..3u64).map(move |hour| BackupInfo {
                    id: format!("board-{}-interval", day * DAY_MS + hour * 3_600_000),
                    saved_at: day * DAY_MS + hour * 3_600_000,
                    reason: "interval".into(),
                })
            })
            .collect();
        list.sort_by_key(|b| std::cmp::Reverse(b.saved_at));
        let delete: HashSet<String> = backups_to_delete(&list, now).into_iter().collect();
        let kept: Vec<&BackupInfo> = list.iter().filter(|b| !delete.contains(&b.id)).collect();

        assert!(
            list[..KEEP_RECENT_BACKUPS]
                .iter()
                .all(|b| !delete.contains(&b.id)),
            "newest are kept"
        );
        assert!(
            kept.iter()
                .all(|b| b.saved_at >= now - KEEP_DAILY_BACKUPS_FOR_DAYS * DAY_MS),
            "older than 60 days are removed"
        );
        let days: HashSet<u64> = kept.iter().map(|b| b.saved_at / DAY_MS).collect();
        for day in 40..90u64 {
            assert!(days.contains(&day), "day {day} keeps a backup");
        }
        let older = &kept[KEEP_RECENT_BACKUPS..];
        let older_days: HashSet<u64> = older.iter().map(|b| b.saved_at / DAY_MS).collect();
        assert_eq!(
            older_days.len(),
            older.len(),
            "one per day beyond the newest"
        );
    }

    #[test]
    fn exports_must_be_valid_json() {
        let dir = TempDir::new();
        fs::create_dir_all(&dir.0).unwrap();
        let path = dir.0.join("export.json");
        assert!(export_to(&path, "{oops").is_err());
        assert!(!path.exists());
        export_to(&path, &board("exported")).unwrap();
        assert_eq!(read_import(&path).unwrap(), board("exported"));
    }
}
