use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use ssh2::{FileStat, Session as Ssh2Session, Sftp};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, State, WebviewWindow,Runtime};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone)]
pub struct Permissions {
    pub mode: u32,
    pub readable: bool,
    pub writable: bool,
    pub executable: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VfsNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub mtime: u64,
    pub permissions: Permissions,
    pub owner: Option<String>,
    pub group: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionConfig {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub auth: Option<AuthConfig>,
    #[serde(default)]
    pub meta: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AuthConfig {
    pub method: String,
    pub username: Option<String>,
    #[serde(rename = "secret_ref")]
    pub secret_ref: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BookmarkGroup {
    pub id: String,
    pub name: String,
    pub is_system: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SshSessionConfig {
    pub id: String,
    #[serde(rename = "groupId")]
    pub group_id: String,
    pub title: String,
    pub protocol: String,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    #[serde(rename = "authType")]
    pub auth_type: String,
    #[serde(rename = "secretRef")]
    pub secret_ref: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BookmarkGroupWithItems {
    pub group: BookmarkGroup,
    pub items: Vec<SshSessionConfig>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct QuickCommandItem {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub scope: String,
    pub command: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct BookmarkStorage {
    groups: Vec<BookmarkGroup>,
    sessions: Vec<SshSessionConfig>,
    #[serde(default)]
    quick_commands: Vec<QuickCommandItem>,
}

enum SessionHandle {
    LocalPty(Box<dyn portable_pty::MasterPty + Send>),
    RemoteSsh {
        resize_tx: mpsc::Sender<(u16, u16)>,
        shutdown_tx: mpsc::Sender<()>,
    },
}

struct SessionState {
    tx: mpsc::Sender<Vec<u8>>,
    handle: SessionHandle,
    backlog: Arc<Mutex<Vec<u8>>>,
}

struct AppState {
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
    vfs_sessions: Arc<Mutex<HashMap<String, SessionConfig>>>,
    transfer_tasks: Arc<Mutex<HashMap<String, Arc<Mutex<TransferTaskState>>>>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TransferProgress {
    pub task_id: String,
    pub bytes_transferred: u64,
    pub bytes_total: u64,
    pub speed_bps: u64,
    pub status: String,
    pub error_message: Option<String>,
    pub filename: String,
    pub path: String,
    pub direction: String,
}

#[derive(Clone)]
struct TransferTaskState {
    progress: TransferProgress,
    paused: bool,
    cancelled: bool,
    updated_at: u64,
    completed_at: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct VfsTransferEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Deserialize, Clone)]
struct VfsTransferRequest {
    vfs_session_id: String,
    direction: String,
    local_base_path: String,
    remote_base_path: String,
    entries: Vec<VfsTransferEntry>,
}

#[derive(Deserialize)]
struct VfsRenameRequest {
    vfs_session_id: String,
    path: String,
    next_name: String,
}

#[derive(Deserialize)]
struct VfsDeleteRequest {
    vfs_session_id: String,
    paths: Vec<String>,
}

#[derive(Deserialize)]
struct VfsCreateDirRequest {
    vfs_session_id: String,
    parent_path: String,
    name: String,
}

fn default_bookmark_group() -> BookmarkGroup {
    BookmarkGroup {
        id: "default".into(),
        name: "Default".into(),
        is_system: true,
    }
}

fn bookmark_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;
    Ok(base_dir.join("bookmarks.json"))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn file_mode_to_permissions(mode: u32) -> Permissions {
    Permissions {
        mode,
        readable: mode & 0o444 != 0,
        writable: mode & 0o222 != 0,
        executable: mode & 0o111 != 0,
    }
}

fn local_metadata_mode(metadata: &fs::Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode()
    }
    #[cfg(not(unix))]
    {
        if metadata.permissions().readonly() { 0o444 } else { 0o644 }
    }
}

fn normalize_remote_path(path: &str) -> String {
    if path.trim().is_empty() {
        ".".into()
    } else {
        path.into()
    }
}

fn build_ssh_destination(config: &SessionConfig) -> Result<String, String> {
    let host = config
        .host
        .clone()
        .filter(|host| !host.trim().is_empty())
        .ok_or_else(|| "Remote host is required".to_string())?;
    let username = config
        .auth
        .as_ref()
        .and_then(|auth| auth.username.clone())
        .filter(|username| !username.trim().is_empty());
    Ok(match username {
        Some(username) => format!("{}@{}", username, host),
        None => host,
    })
}

fn sshpass_available() -> bool {
    Command::new("sshpass")
        .arg("-V")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn apply_ssh_args(cmd: &mut CommandBuilder, config: &SessionConfig, destination: &str) {
    cmd.arg("-o");
    cmd.arg("ServerAliveInterval=30");
    cmd.arg("-o");
    cmd.arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-p");
    cmd.arg(config.port.unwrap_or(22).to_string());

    if let Some(auth) = &config.auth {
        if auth.method == "keyfile" {
            if let Some(secret_ref) = &auth.secret_ref {
                if !secret_ref.trim().is_empty() {
                    cmd.arg("-i");
                    cmd.arg(secret_ref);
                }
            }
        }
    }

    cmd.arg(destination);
}

fn open_ssh_session(config: &SessionConfig) -> Result<Ssh2Session, String> {
    let host = config
        .host
        .clone()
        .filter(|host| !host.trim().is_empty())
        .ok_or_else(|| "Remote host is required".to_string())?;
    let username = config
        .auth
        .as_ref()
        .and_then(|auth| auth.username.clone())
        .filter(|username| !username.trim().is_empty())
        .unwrap_or_else(|| "root".into());
    let tcp = TcpStream::connect((host.as_str(), config.port.unwrap_or(22))).map_err(|e| e.to_string())?;
    tcp.set_read_timeout(Some(std::time::Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    tcp.set_write_timeout(Some(std::time::Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    let mut session = Ssh2Session::new().map_err(|e| e.to_string())?;
    session.set_tcp_stream(tcp);
    session.set_timeout(10_000);
    session.handshake().map_err(|e| e.to_string())?;

    match config.auth.as_ref().map(|auth| auth.method.as_str()) {
        Some("keyfile") => {
            let key_path = config
                .auth
                .as_ref()
                .and_then(|auth| auth.secret_ref.clone())
                .filter(|path| !path.trim().is_empty())
                .ok_or_else(|| "Key file path is required".to_string())?;
            session
                .userauth_pubkey_file(&username, None, Path::new(&key_path), None)
                .map_err(|e| e.to_string())?;
        }
        Some("password") => {
            let password = config
                .auth
                .as_ref()
                .and_then(|auth| auth.secret_ref.clone())
                .ok_or_else(|| "Password is required for remote file access".to_string())?;
            session
                .userauth_password(&username, &password)
                .map_err(|e| e.to_string())?;
        }
        _ => return Err("Unsupported authentication method".into()),
    }

    if !session.authenticated() {
        return Err("SSH authentication failed".into());
    }

    Ok(session)
}

fn create_remote_ssh_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    config: SessionConfig,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let runtime_id = Uuid::new_v4().to_string();
    report_debug_event(
        "A",
        "src-tauri/src/lib.rs:create_remote_ssh_stream:enter",
        "create_remote_ssh_stream entered",
        serde_json::json!({
            "runtimeSessionId": runtime_id,
            "protocol": config.protocol,
            "host": config.host,
            "port": config.port,
            "username": config.auth.as_ref().and_then(|auth| auth.username.clone()),
            "authMethod": config.auth.as_ref().map(|auth| auth.method.clone()),
            "hasSecretRef": config.auth.as_ref().and_then(|auth| auth.secret_ref.clone()).map(|value| !value.is_empty()),
            "cols": cols,
            "rows": rows,
        }),
    );

    let session = open_ssh_session(&config)?;
    let mut channel = session.channel_session().map_err(|e| e.to_string())?;
    channel
        .request_pty("xterm-256color", None, Some((cols as u32, rows as u32, 0, 0)))
        .map_err(|e| e.to_string())?;
    channel.shell().map_err(|e| e.to_string())?;
    session.set_blocking(false);
    report_debug_event(
        "B",
        "src-tauri/src/lib.rs:create_remote_ssh_stream:shell",
        "ssh shell started",
        serde_json::json!({
            "runtimeSessionId": runtime_id,
            "protocol": config.protocol,
        }),
    );

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(64);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u16, u16)>(16);
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let backlog = Arc::new(Mutex::new(Vec::new()));

    state.sessions.lock().unwrap().insert(
        runtime_id.clone(),
        SessionState {
            tx,
            handle: SessionHandle::RemoteSsh {
                resize_tx,
                shutdown_tx,
            },
            backlog: backlog.clone(),
        },
    );

    let runtime_id_clone = runtime_id.clone();
    let backlog_for_reader = backlog.clone();
    std::thread::spawn(move || {
        let _session = session;
        let mut channel = channel;
        let mut pending_writes: Vec<Vec<u8>> = Vec::new();
        let mut buf = [0u8; 4096];
        let mut first_stdout_reported = false;

        loop {
            if shutdown_rx.try_recv().is_ok() {
                let _ = channel.close();
                break;
            }

            while let Ok((next_cols, next_rows)) = resize_rx.try_recv() {
                let _ = channel.request_pty_size(next_cols as u32, next_rows as u32, None, None);
            }

            while let Ok(data) = rx.try_recv() {
                pending_writes.push(data);
            }

            if !pending_writes.is_empty() {
                let mut remaining = Vec::new();
                for payload in pending_writes.drain(..) {
                    match channel.write_all(&payload) {
                        Ok(_) => {
                            let _ = channel.flush();
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => remaining.push(payload),
                        Err(error) => {
                            report_debug_event(
                                "D",
                                "src-tauri/src/lib.rs:create_remote_ssh_stream:write",
                                "remote ssh write failed",
                                serde_json::json!({
                                    "runtimeSessionId": runtime_id_clone,
                                    "error": error.to_string(),
                                }),
                            );
                            emit_term_output(
                                &app,
                                &runtime_id_clone,
                                &backlog_for_reader,
                                format!("\r\n[SSH write failed] {}\r\n", error).into_bytes(),
                            );
                            let _ = channel.close();
                            return;
                        }
                    }
                }
                pending_writes = remaining;
            }

            match channel.read(&mut buf) {
                Ok(0) => {
                    if channel.eof() {
                        break;
                    }
                }
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    if !first_stdout_reported {
                        first_stdout_reported = true;
                        report_debug_event(
                            "C",
                            "src-tauri/src/lib.rs:create_remote_ssh_stream:reader",
                            "remote ssh received first output chunk",
                            serde_json::json!({
                                "runtimeSessionId": runtime_id_clone,
                                "bytes": n,
                                "preview": String::from_utf8_lossy(&data).chars().take(120).collect::<String>(),
                            }),
                        );
                    }
                    emit_term_output(&app, &runtime_id_clone, &backlog_for_reader, data);
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(error) => {
                    report_debug_event(
                        "B",
                        "src-tauri/src/lib.rs:create_remote_ssh_stream:reader",
                        "remote ssh reader failed",
                        serde_json::json!({
                            "runtimeSessionId": runtime_id_clone,
                            "error": error.to_string(),
                        }),
                    );
                    emit_term_output(
                        &app,
                        &runtime_id_clone,
                        &backlog_for_reader,
                        format!("\r\n[SSH reader failed] {}\r\n", error).into_bytes(),
                    );
                    break;
                }
            }

            if channel.eof() {
                break;
            }

            std::thread::sleep(std::time::Duration::from_millis(12));
        }

        let exit_status = channel.exit_status().ok();
        report_debug_event(
            "B",
            "src-tauri/src/lib.rs:create_remote_ssh_stream:exit",
            "remote ssh channel closed",
            serde_json::json!({
                "runtimeSessionId": runtime_id_clone,
                "exitStatus": exit_status,
            }),
        );
        let close_message = if first_stdout_reported {
            b"\r\n[Session closed]\r\n".to_vec()
        } else {
            match exit_status {
                Some(status) => format!(
                    "\r\n[SSH session closed before shell became interactive, exit status: {}]\r\n",
                    status
                )
                .into_bytes(),
                None => b"\r\n[SSH session closed before shell became interactive]\r\n".to_vec(),
            }
        };
        emit_term_output(&app, &runtime_id_clone, &backlog_for_reader, close_message);
    });

    Ok(runtime_id)
}

fn list_local_dir(path: &str) -> Result<Vec<VfsNode>, String> {
    let normalized_path = if path.trim().is_empty() { "/" } else { path };
    let dir = Path::new(normalized_path);
    let mut nodes = Vec::new();

    if normalized_path != "/" {
        let parent = dir.parent().unwrap_or_else(|| Path::new("/"));
        nodes.push(VfsNode {
            name: "..".into(),
            path: parent.to_string_lossy().into_owned(),
            is_dir: true,
            is_symlink: false,
            size: 0,
            mtime: now_ms() / 1000,
            permissions: file_mode_to_permissions(0o755),
            owner: None,
            group: None,
        });
    }

    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let mode = local_metadata_mode(&metadata);
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|time| time.as_secs())
            .unwrap_or(now_ms() / 1000);
        nodes.push(VfsNode {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: metadata.is_dir(),
            is_symlink: entry.file_type().map(|kind| kind.is_symlink()).unwrap_or(false),
            size: metadata.len(),
            mtime: modified,
            permissions: file_mode_to_permissions(mode),
            owner: None,
            group: None,
        });
    }

    nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(nodes)
}

fn stat_is_dir(stat: &FileStat) -> bool {
    stat.perm.unwrap_or(0) & 0o170000 == 0o040000
}

fn read_remote_dir(sftp: &Sftp, path: &str) -> Result<Vec<VfsNode>, String> {
    let normalized_path = normalize_remote_path(path);
    let mut nodes = Vec::new();

    if normalized_path != "/" && normalized_path != "." {
        let parent = Path::new(&normalized_path)
            .parent()
            .unwrap_or_else(|| Path::new("/"))
            .to_string_lossy()
            .into_owned();
        nodes.push(VfsNode {
            name: "..".into(),
            path: if parent.is_empty() { "/".into() } else { parent },
            is_dir: true,
            is_symlink: false,
            size: 0,
            mtime: now_ms() / 1000,
            permissions: file_mode_to_permissions(0o755),
            owner: None,
            group: None,
        });
    }

    let remote_entries = sftp.readdir(Path::new(&normalized_path)).map_err(|e| e.to_string())?;
    for (entry_path, stat) in remote_entries {
        let name = entry_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| entry_path.to_string_lossy().into_owned());
        if name == "." || name == ".." {
            continue;
        }
        let mode = stat.perm.unwrap_or(0);
        nodes.push(VfsNode {
            name,
            path: entry_path.to_string_lossy().into_owned(),
            is_dir: stat_is_dir(&stat),
            is_symlink: mode & 0o170000 == 0o120000,
            size: stat.size.unwrap_or(0),
            mtime: stat.mtime.unwrap_or(now_ms() / 1000),
            permissions: file_mode_to_permissions(mode),
            owner: stat.uid.map(|value| value.to_string()),
            group: stat.gid.map(|value| value.to_string()),
        });
    }

    nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(nodes)
}

fn join_remote_path(base: &str, name: &str) -> String {
    let normalized = normalize_remote_path(base);
    if normalized == "." || normalized == "/" {
        format!("/{}", name.trim_start_matches('/'))
    } else {
        format!(
            "{}/{}",
            normalized.trim_end_matches('/'),
            name.trim_start_matches('/')
        )
    }
}

fn sanitize_child_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Name is required".into());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("Reserved names are not allowed".into());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Name cannot contain path separators".into());
    }
    Ok(trimmed.into())
}

fn compute_local_total_size(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        let mut total = 0u64;
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            total = total.saturating_add(compute_local_total_size(&entry.path())?);
        }
        Ok(total)
    } else {
        Ok(metadata.len())
    }
}

fn compute_remote_total_size(sftp: &Sftp, path: &Path) -> Result<u64, String> {
    let stat = sftp.stat(path).map_err(|e| e.to_string())?;
    if stat_is_dir(&stat) {
        let mut total = 0u64;
        for (child_path, _) in sftp.readdir(path).map_err(|e| e.to_string())? {
            let name = child_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name == "." || name == ".." {
                continue;
            }
            total = total.saturating_add(compute_remote_total_size(sftp, &child_path)?);
        }
        Ok(total)
    } else {
        Ok(stat.size.unwrap_or(0))
    }
}

fn create_remote_dir_if_missing(sftp: &Sftp, path: &Path) -> Result<(), String> {
    match sftp.stat(path) {
        Ok(stat) => {
            if stat_is_dir(&stat) {
                Ok(())
            } else {
                Err(format!("Remote path is not a directory: {}", path.display()))
            }
        }
        Err(_) => sftp.mkdir(path, 0o755).map_err(|e| e.to_string()),
    }
}

fn create_remote_dir_all(sftp: &Sftp, path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    if path_str.is_empty() || path_str == "." || path_str == "/" {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        create_remote_dir_all(sftp, parent)?;
    }
    create_remote_dir_if_missing(sftp, path)
}

fn update_transfer_progress_bytes(
    task: &Arc<Mutex<TransferTaskState>>,
    transferred: u64,
    total: u64,
    started_at: &Instant,
) {
    let elapsed = started_at.elapsed().as_secs_f64().max(0.001);
    update_transfer_state(task, |state| {
        state.progress.bytes_total = total;
        state.progress.bytes_transferred = transferred;
        state.progress.speed_bps = (transferred as f64 / elapsed) as u64;
        state.progress.status = "TRANSFERRING".into();
    });
}

fn copy_local_file_to_remote(
    task: &Arc<Mutex<TransferTaskState>>,
    sftp: &Sftp,
    local_path: &Path,
    remote_path: &Path,
    transferred: &mut u64,
    total: u64,
    started_at: &Instant,
) -> Result<(), String> {
    if let Some(parent) = remote_path.parent() {
        create_remote_dir_all(sftp, parent)?;
    }
    let mut source = fs::File::open(local_path).map_err(|e| e.to_string())?;
    let mut target = sftp.create(remote_path).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 64 * 1024];

    loop {
        wait_for_transfer_slot(task)?;
        let read = source.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        target.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        *transferred = transferred.saturating_add(read as u64);
        update_transfer_progress_bytes(task, *transferred, total, started_at);
    }

    target.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn upload_path_recursive(
    task: &Arc<Mutex<TransferTaskState>>,
    sftp: &Sftp,
    local_path: &Path,
    remote_path: &Path,
    transferred: &mut u64,
    total: u64,
    started_at: &Instant,
) -> Result<(), String> {
    wait_for_transfer_slot(task)?;
    let metadata = fs::metadata(local_path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        create_remote_dir_all(sftp, remote_path)?;
        for entry in fs::read_dir(local_path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let next_remote = remote_path.join(&name);
            upload_path_recursive(
                task,
                sftp,
                &entry.path(),
                &next_remote,
                transferred,
                total,
                started_at,
            )?;
        }
        Ok(())
    } else {
        copy_local_file_to_remote(task, sftp, local_path, remote_path, transferred, total, started_at)
    }
}

fn copy_remote_file_to_local(
    task: &Arc<Mutex<TransferTaskState>>,
    sftp: &Sftp,
    remote_path: &Path,
    local_path: &Path,
    transferred: &mut u64,
    total: u64,
    started_at: &Instant,
) -> Result<(), String> {
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut source = sftp.open(remote_path).map_err(|e| e.to_string())?;
    let mut target = fs::File::create(local_path).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 64 * 1024];

    loop {
        wait_for_transfer_slot(task)?;
        let read = source.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        target.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        *transferred = transferred.saturating_add(read as u64);
        update_transfer_progress_bytes(task, *transferred, total, started_at);
    }

    target.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn download_path_recursive(
    task: &Arc<Mutex<TransferTaskState>>,
    sftp: &Sftp,
    remote_path: &Path,
    local_path: &Path,
    transferred: &mut u64,
    total: u64,
    started_at: &Instant,
) -> Result<(), String> {
    wait_for_transfer_slot(task)?;
    let stat = sftp.stat(remote_path).map_err(|e| e.to_string())?;
    if stat_is_dir(&stat) {
        fs::create_dir_all(local_path).map_err(|e| e.to_string())?;
        for (child_path, _) in sftp.readdir(remote_path).map_err(|e| e.to_string())? {
            let name = child_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name == "." || name == ".." {
                continue;
            }
            download_path_recursive(
                task,
                sftp,
                &child_path,
                &local_path.join(&name),
                transferred,
                total,
                started_at,
            )?;
        }
        Ok(())
    } else {
        copy_remote_file_to_local(task, sftp, remote_path, local_path, transferred, total, started_at)
    }
}

fn delete_local_path_recursive(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn delete_remote_path_recursive(sftp: &Sftp, path: &Path) -> Result<(), String> {
    let stat = sftp.stat(path).map_err(|e| e.to_string())?;
    if stat_is_dir(&stat) {
        for (child_path, _) in sftp.readdir(path).map_err(|e| e.to_string())? {
            let name = child_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_default();
            if name == "." || name == ".." {
                continue;
            }
            delete_remote_path_recursive(sftp, &child_path)?;
        }
        sftp.rmdir(path).map_err(|e| e.to_string())
    } else {
        sftp.unlink(path).map_err(|e| e.to_string())
    }
}

fn build_sibling_path(path: &str, next_name: &str, is_remote: bool) -> Result<String, String> {
    let safe_name = sanitize_child_name(next_name)?;
    let current = Path::new(path);
    let parent = current.parent().unwrap_or_else(|| Path::new("/"));
    if is_remote {
        let parent_str = parent.to_string_lossy();
        Ok(join_remote_path(&parent_str, &safe_name))
    } else {
        Ok(parent.join(&safe_name).to_string_lossy().into_owned())
    }
}

fn clone_transfer_progress(task: &Arc<Mutex<TransferTaskState>>) -> Option<TransferProgress> {
    task.lock().ok().map(|state| state.progress.clone())
}

fn update_transfer_state(
    task: &Arc<Mutex<TransferTaskState>>,
    updater: impl FnOnce(&mut TransferTaskState),
) {
    if let Ok(mut state) = task.lock() {
        updater(&mut state);
        state.updated_at = now_ms();
    }
}

fn wait_for_transfer_slot(task: &Arc<Mutex<TransferTaskState>>) -> Result<(), String> {
    loop {
        let (paused, cancelled) = task
            .lock()
            .map(|state| (state.paused, state.cancelled))
            .unwrap_or((false, true));
        if cancelled {
            return Err("Transfer cancelled".into());
        }
        if !paused {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(120));
    }
}

fn mark_transfer_failed(task: &Arc<Mutex<TransferTaskState>>, message: String) {
    update_transfer_state(task, |state| {
        state.progress.status = "FAILED".into();
        state.progress.error_message = Some(message);
        state.progress.speed_bps = 0;
        state.completed_at = Some(now_ms());
    });
}

fn mark_transfer_completed(task: &Arc<Mutex<TransferTaskState>>) {
    update_transfer_state(task, |state| {
        state.progress.status = "COMPLETED".into();
        state.progress.error_message = None;
        state.progress.speed_bps = 0;
        state.completed_at = Some(now_ms());
    });
}

fn run_upload_task(task: Arc<Mutex<TransferTaskState>>, config: SessionConfig, local_path: String, remote_path: String) -> Result<(), String> {
    let ssh_session = open_ssh_session(&config)?;
    let sftp = ssh_session.sftp().map_err(|e| e.to_string())?;
    let total = compute_local_total_size(Path::new(&local_path))?;
    let mut transferred = 0u64;
    let started_at = Instant::now();

    update_transfer_state(&task, |state| {
        state.progress.bytes_total = total;
        state.progress.bytes_transferred = 0;
        state.progress.status = "TRANSFERRING".into();
        state.progress.error_message = None;
    });

    upload_path_recursive(
        &task,
        &sftp,
        Path::new(&local_path),
        Path::new(&remote_path),
        &mut transferred,
        total,
        &started_at,
    )?;
    Ok(())
}

fn run_download_task(task: Arc<Mutex<TransferTaskState>>, config: SessionConfig, remote_path: String, local_path: String, expected_size: u64) -> Result<(), String> {
    let ssh_session = open_ssh_session(&config)?;
    let sftp = ssh_session.sftp().map_err(|e| e.to_string())?;
    let total = compute_remote_total_size(&sftp, Path::new(&remote_path)).unwrap_or(expected_size);
    let mut transferred = 0u64;
    let started_at = Instant::now();

    update_transfer_state(&task, |state| {
        state.progress.bytes_total = total;
        state.progress.bytes_transferred = 0;
        state.progress.status = "TRANSFERRING".into();
        state.progress.error_message = None;
    });

    download_path_recursive(
        &task,
        &sftp,
        Path::new(&remote_path),
        Path::new(&local_path),
        &mut transferred,
        total,
        &started_at,
    )?;
    Ok(())
}

fn spawn_transfer_task(
    task: Arc<Mutex<TransferTaskState>>,
    config: SessionConfig,
    direction: String,
    local_path: String,
    remote_path: String,
    expected_size: u64,
) {
    std::thread::spawn(move || {
        let result = match direction.as_str() {
            "UPLOAD" => run_upload_task(task.clone(), config, local_path, remote_path),
            "DOWNLOAD" => run_download_task(task.clone(), config, remote_path, local_path, expected_size),
            _ => Err("Unsupported transfer direction".into()),
        };

        match result {
            Ok(_) => mark_transfer_completed(&task),
            Err(error) => mark_transfer_failed(&task, error),
        }
    });
}

fn append_term_backlog(backlog: &Arc<Mutex<Vec<u8>>>, data: &[u8]) {
    if let Ok(mut backlog) = backlog.lock() {
        backlog.extend_from_slice(data);
        if backlog.len() > 128 * 1024 {
            let drain_len = backlog.len().saturating_sub(128 * 1024);
            backlog.drain(..drain_len);
        }
    }
}

fn emit_term_output(
    app: &AppHandle,
    runtime_session_id: &str,
    backlog: &Arc<Mutex<Vec<u8>>>,
    data: Vec<u8>,
) {
    append_term_backlog(backlog, &data);
    let _ = app.emit(&format!("term_stdout_{}", runtime_session_id), data);
}

// #region debug-point shared:debug-report
fn report_debug_event(hypothesis_id: &str, location: &str, msg: &str, data: serde_json::Value) {
    let payload = serde_json::json!({
        "sessionId": "ssh-black-screen",
        "runId": "pre-fix",
        "hypothesisId": hypothesis_id,
        "location": location,
        "msg": format!("[DEBUG] {}", msg),
        "data": data,
        "ts": now_ms(),
    });
    let _ = Command::new("curl")
        .arg("-s")
        .arg("-X")
        .arg("POST")
        .arg("http://127.0.0.1:7777/event")
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("-d")
        .arg(payload.to_string())
        .output();
}
// #endregion

fn resize_main_window(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No active monitor found".to_string())?;
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let monitor_size = monitor.size().to_logical::<f64>(scale_factor);

    window
        .set_size(LogicalSize::new(monitor_size.width * 0.8, monitor_size.height * 0.8))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}

fn default_quick_commands() -> Vec<QuickCommandItem> {
    vec![
        QuickCommandItem {
            id: Uuid::new_v4().to_string(),
            title: "本地环境巡检".into(),
            description: Some("查看本机用户名、主机名和系统运行时间".into()),
            scope: "LOCAL".into(),
            command: "whoami && hostname && uptime".into(),
            tags: vec!["本地".into(), "巡检".into()],
            updated_at: now_ms(),
        },
        QuickCommandItem {
            id: Uuid::new_v4().to_string(),
            title: "Docker 状态摘要".into(),
            description: Some("快速查看容器运行状态".into()),
            scope: "LOCAL".into(),
            command: "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'".into(),
            tags: vec!["Docker".into(), "状态".into()],
            updated_at: now_ms(),
        },
        QuickCommandItem {
            id: Uuid::new_v4().to_string(),
            title: "SSH 会话初始化".into(),
            description: Some("进入服务器后快速确认用户、路径和负载情况".into()),
            scope: "REMOTE".into(),
            command: "whoami && pwd && uptime && df -h".into(),
            tags: vec!["SSH".into(), "初始化".into()],
            updated_at: now_ms(),
        },
    ]
}

fn load_bookmark_storage(app: &AppHandle) -> Result<BookmarkStorage, String> {
    let path = bookmark_storage_path(app)?;
    if !path.exists() {
        return Ok(BookmarkStorage {
            groups: vec![default_bookmark_group()],
            sessions: Vec::new(),
            quick_commands: default_quick_commands(),
        });
    }

    let contents = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut storage = serde_json::from_str::<BookmarkStorage>(&contents).map_err(|e| e.to_string())?;
    if !storage.groups.iter().any(|group| group.id == "default") {
        storage.groups.insert(0, default_bookmark_group());
    }
    Ok(storage)
}

fn persist_bookmark_storage(app: &AppHandle, storage: &BookmarkStorage) -> Result<(), String> {
    let path = bookmark_storage_path(app)?;
    let contents = serde_json::to_string_pretty(storage).map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_bookmark_group(app: AppHandle, name: String) -> Result<String, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Group name is required".into());
    }

    let mut storage = load_bookmark_storage(&app)?;
    let new_id = Uuid::new_v4().to_string();
    storage.groups.push(BookmarkGroup {
        id: new_id.clone(),
        name: trimmed_name.into(),
        is_system: false,
    });
    persist_bookmark_storage(&app, &storage)?;
    Ok(new_id)
}

#[tauri::command]
async fn get_quick_commands(app: AppHandle) -> Result<Vec<QuickCommandItem>, String> {
    let mut commands = load_bookmark_storage(&app)?.quick_commands;
    commands.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(commands)
}

#[tauri::command]
async fn save_quick_command(app: AppHandle, mut command: QuickCommandItem) -> Result<String, String> {
    if command.title.trim().is_empty() {
        return Err("Quick command title is required".into());
    }
    if command.command.trim().is_empty() {
        return Err("Quick command content is required".into());
    }
    if command.scope.trim().is_empty() {
        command.scope = "LOCAL".into();
    }
    if command.id.trim().is_empty() {
        command.id = Uuid::new_v4().to_string();
    }
    command.updated_at = now_ms();
    command.tags = command
        .tags
        .into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect();

    let mut storage = load_bookmark_storage(&app)?;
    storage.quick_commands.retain(|item| item.id != command.id);
    storage.quick_commands.push(command.clone());
    persist_bookmark_storage(&app, &storage)?;
    Ok(command.id)
}

#[tauri::command]
async fn delete_quick_command(app: AppHandle, command_id: String) -> Result<(), String> {
    let mut storage = load_bookmark_storage(&app)?;
    let before_len = storage.quick_commands.len();
    storage.quick_commands.retain(|item| item.id != command_id);
    if storage.quick_commands.len() == before_len {
        return Err("Quick command not found".into());
    }
    persist_bookmark_storage(&app, &storage)?;
    Ok(())
}

#[tauri::command]
async fn rename_bookmark_group(app: AppHandle, group_id: String, name: String) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Group name is required".into());
    }

    let mut storage = load_bookmark_storage(&app)?;
    let group = storage
        .groups
        .iter_mut()
        .find(|group| group.id == group_id)
        .ok_or_else(|| "Bookmark group not found".to_string())?;

    if group.is_system {
        return Err("System bookmark groups cannot be renamed".into());
    }

    group.name = trimmed_name.into();
    persist_bookmark_storage(&app, &storage)?;
    Ok(())
}

#[tauri::command]
async fn delete_bookmark_group(app: AppHandle, group_id: String) -> Result<(), String> {
    let mut storage = load_bookmark_storage(&app)?;
    let group = storage
        .groups
        .iter()
        .find(|group| group.id == group_id)
        .cloned()
        .ok_or_else(|| "Bookmark group not found".to_string())?;

    if group.is_system {
        return Err("System bookmark groups cannot be deleted".into());
    }

    if storage.sessions.iter().any(|item| item.group_id == group_id) {
        return Err("Cannot delete a bookmark group that still contains sessions".into());
    }

    storage.groups.retain(|item| item.id != group_id);
    persist_bookmark_storage(&app, &storage)?;
    Ok(())
}

#[tauri::command]
async fn create_term_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    config: SessionConfig,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    if config.protocol == "SSH" {
        return create_remote_ssh_stream(app, state, config, cols, rows);
    }

    let runtime_id = Uuid::new_v4().to_string();
    // #region debug-point A:create-term-enter
    report_debug_event(
        "A",
        "src-tauri/src/lib.rs:create_term_stream:enter",
        "create_term_stream entered",
        serde_json::json!({
            "runtimeSessionId": runtime_id,
            "protocol": config.protocol,
            "host": config.host,
            "port": config.port,
            "username": config.auth.as_ref().and_then(|auth| auth.username.clone()),
            "authMethod": config.auth.as_ref().map(|auth| auth.method.clone()),
            "hasSecretRef": config.auth.as_ref().and_then(|auth| auth.secret_ref.clone()).map(|value| !value.is_empty()),
            "cols": cols,
            "rows": rows,
        }),
    );
    // #endregion

    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let mut cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(target_os = "windows"))]
    let mut cmd = if config.protocol == "SSH" {
        let destination = build_ssh_destination(&config)?;
        let wants_password = config
            .auth
            .as_ref()
            .map(|auth| auth.method == "password" && auth.secret_ref.as_ref().map(|value| !value.is_empty()).unwrap_or(false))
            .unwrap_or(false);

        if wants_password && sshpass_available() {
            let password = config
                .auth
                .as_ref()
                .and_then(|auth| auth.secret_ref.clone())
                .ok_or_else(|| "Password is required".to_string())?;
            let mut sshpass_cmd = CommandBuilder::new("sshpass");
            sshpass_cmd.arg("-p");
            sshpass_cmd.arg(password);
            sshpass_cmd.arg("ssh");
            apply_ssh_args(&mut sshpass_cmd, &config, &destination);
            sshpass_cmd
        } else {
            let mut ssh_cmd = CommandBuilder::new("ssh");
            apply_ssh_args(&mut ssh_cmd, &config, &destination);
            ssh_cmd
        }
    } else {
        CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string()))
    };
    // #region debug-point B:command-built
    report_debug_event(
        "B",
        "src-tauri/src/lib.rs:create_term_stream:command",
        "terminal command constructed",
        serde_json::json!({
            "runtimeSessionId": runtime_id,
            "protocol": config.protocol,
            "isRemoteSsh": config.protocol == "SSH",
        }),
    );
    // #endregion
    #[cfg(not(target_os = "windows"))]
    cmd.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| {
        // #region debug-point B:spawn-failed
        report_debug_event(
            "B",
            "src-tauri/src/lib.rs:create_term_stream:spawn",
            "spawn_command failed",
            serde_json::json!({
                "runtimeSessionId": runtime_id,
                "error": e.to_string(),
                "protocol": config.protocol,
            }),
        );
        // #endregion
        e.to_string()
    })?;
    // #region debug-point B:spawn-success
    report_debug_event(
        "B",
        "src-tauri/src/lib.rs:create_term_stream:spawn",
        "spawn_command succeeded",
        serde_json::json!({
            "runtimeSessionId": runtime_id,
            "protocol": config.protocol,
        }),
    );
    // #endregion
    // #region debug-point B:child-exit-watch
    let runtime_id_for_exit = runtime_id.clone();
    let protocol_for_exit = config.protocol.clone();
    std::thread::spawn(move || {
        match child.wait() {
            Ok(status) => report_debug_event(
                "B",
                "src-tauri/src/lib.rs:create_term_stream:child-exit",
                "ssh child process exited",
                serde_json::json!({
                    "runtimeSessionId": runtime_id_for_exit,
                    "protocol": protocol_for_exit,
                    "status": format!("{:?}", status),
                }),
            ),
            Err(error) => report_debug_event(
                "B",
                "src-tauri/src/lib.rs:create_term_stream:child-exit",
                "failed to wait child process",
                serde_json::json!({
                    "runtimeSessionId": runtime_id_for_exit,
                    "protocol": protocol_for_exit,
                    "error": error.to_string(),
                }),
            ),
        }
    });
    // #endregion

    // Drop the slave handle so the child process owns it
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(32);
    let backlog = Arc::new(Mutex::new(Vec::new()));

    let session_state = SessionState {
        tx,
        handle: SessionHandle::LocalPty(pair.master),
        backlog: backlog.clone(),
    };

    state
        .sessions
        .lock()
        .unwrap()
        .insert(runtime_id.clone(), session_state);

    let runtime_id_clone = runtime_id.clone();
    let backlog_for_reader = backlog.clone();
    
    // Spawn reader thread (reads from PTY, sends to frontend)
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    // #region debug-point C:reader-output
                    if backlog_for_reader.lock().map(|backlog| backlog.is_empty()).unwrap_or(false) {
                        report_debug_event(
                            "C",
                            "src-tauri/src/lib.rs:create_term_stream:reader",
                            "reader received first output chunk",
                            serde_json::json!({
                                "runtimeSessionId": runtime_id_clone,
                                "bytes": n,
                                "preview": String::from_utf8_lossy(&data).chars().take(120).collect::<String>(),
                            }),
                        );
                    }
                    // #endregion
                    append_term_backlog(&backlog_for_reader, &data);
                    if let Err(e) = app.emit(&format!("term_stdout_{}", runtime_id_clone), data) {
                        eprintln!("Failed to emit to frontend: {}", e);
                    }
                }
                Err(_) => break,
            }
        }
        emit_term_output(
            &app,
            &runtime_id_clone,
            &backlog_for_reader,
            b"\r\n[Session closed]\r\n".to_vec(),
        );
    });

    // Spawn writer task (reads from channel, writes to PTY)
    tokio::task::spawn_blocking(move || {
        while let Some(data) = rx.blocking_recv() {
            if writer.write_all(&data).is_err() {
                break;
            }
        }
    });

    Ok(runtime_id)
}

#[tauri::command]
async fn write_term_stream(
    state: State<'_, AppState>,
    runtime_session_id: String,
    payload: Vec<u8>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&runtime_session_id) {
        let _ = session.tx.try_send(payload);
        Ok(())
    } else {
        Err("Session not found".into())
    }
}

/// 智能控制/打开开发者工具的后端 Command
#[tauri::command]
async fn toggle_devtools<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // 获取当前应用的主窗口实例（通常默认叫 "main"）
    if let Some(window) = app.get_webview_window("main") {
        // 智能判定：如果已经打开了就关闭它，没打开则强行唤醒
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
        Ok(())
    } else {
        Err("未能获取到 Foconn 主窗口句柄".to_string())
    }
}

#[tauri::command]
async fn resize_term_stream(
    state: State<'_, AppState>,
    runtime_session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&runtime_session_id) {
        match &session.handle {
            SessionHandle::LocalPty(pty_master) => {
                let _ = pty_master.resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                });
            }
            SessionHandle::RemoteSsh { resize_tx, .. } => {
                let _ = resize_tx.try_send((cols, rows));
            }
        }
        Ok(())
    } else {
        Err("Session not found".into())
    }
}

#[tauri::command]
async fn close_term_stream(
    state: State<'_, AppState>,
    runtime_session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.remove(&runtime_session_id) {
        if let SessionHandle::RemoteSsh { shutdown_tx, .. } = session.handle {
            let _ = shutdown_tx.try_send(());
        }
    }
    Ok(())
}

#[tauri::command]
async fn read_term_backlog(
    state: State<'_, AppState>,
    runtime_session_id: String,
) -> Result<Vec<u8>, String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&runtime_session_id) {
        let mut backlog = session
            .backlog
            .lock()
            .map_err(|_| "Failed to lock term backlog".to_string())?;
        let snapshot = backlog.clone();
        backlog.clear();
        Ok(snapshot)
    } else {
        Err("Session not found".into())
    }
}

#[tauri::command]
async fn save_bookmark(
    app: AppHandle,
    mut config: SshSessionConfig,
) -> Result<String, String> {
    if config.title.trim().is_empty() {
        config.title = config.host.clone();
    }
    if config.group_id.trim().is_empty() {
        config.group_id = "default".into();
    }
    if config.id.trim().is_empty() {
        config.id = Uuid::new_v4().to_string();
    }

    let mut storage = load_bookmark_storage(&app)?;
    if !storage.groups.iter().any(|group| group.id == config.group_id) {
        storage.groups.push(BookmarkGroup {
            id: config.group_id.clone(),
            name: config.group_id.clone(),
            is_system: false,
        });
    }

    storage.sessions.retain(|item| item.id != config.id);
    storage.sessions.push(config.clone());
    persist_bookmark_storage(&app, &storage)?;
    Ok(config.id)
}

#[tauri::command]
async fn get_bookmark_tree(app: AppHandle) -> Result<Vec<BookmarkGroupWithItems>, String> {
    let storage = load_bookmark_storage(&app)?;
    let mut groups_with_items = storage
        .groups
        .into_iter()
        .map(|group| {
            let mut items = storage
                .sessions
                .iter()
                .filter(|item| item.group_id == group.id)
                .cloned()
                .collect::<Vec<_>>();
            items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            BookmarkGroupWithItems { group, items }
        })
        .collect::<Vec<_>>();

    groups_with_items.sort_by(|a, b| {
        if a.group.id == "default" {
            std::cmp::Ordering::Less
        } else if b.group.id == "default" {
            std::cmp::Ordering::Greater
        } else {
            a.group.name.cmp(&b.group.name)
        }
    });

    Ok(groups_with_items)
}

#[tauri::command]
async fn delete_bookmark(app: AppHandle, bookmark_id: String) -> Result<(), String> {
    let mut storage = load_bookmark_storage(&app)?;
    storage.sessions.retain(|item| item.id != bookmark_id);
    persist_bookmark_storage(&app, &storage)?;
    Ok(())
}

#[tauri::command]
async fn duplicate_bookmark(app: AppHandle, bookmark_id: String) -> Result<String, String> {
    let mut storage = load_bookmark_storage(&app)?;
    let existing = storage
        .sessions
        .iter()
        .find(|item| item.id == bookmark_id)
        .cloned()
        .ok_or_else(|| "Bookmark not found".to_string())?;
    let mut duplicate = existing;
    duplicate.id = Uuid::new_v4().to_string();
    duplicate.title = format!("{} Copy", duplicate.title);
    duplicate.updated_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let new_id = duplicate.id.clone();
    storage.sessions.push(duplicate);
    persist_bookmark_storage(&app, &storage)?;
    Ok(new_id)
}

#[tauri::command]
async fn vfs_connect(
    state: State<'_, AppState>,
    config: SessionConfig,
) -> Result<String, String> {
    if config.protocol != "SFTP" {
        return Err("VFS only supports SFTP sessions".into());
    }
    let session_id = Uuid::new_v4().to_string();
    state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .insert(session_id.clone(), config);
    Ok(session_id)
}

#[tauri::command]
async fn vfs_disconnect(
    state: State<'_, AppState>,
    vfs_session_id: String,
) -> Result<(), String> {
    state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .remove(&vfs_session_id);
    Ok(())
}

#[tauri::command]
async fn vfs_list_dir(
    state: State<'_, AppState>,
    vfs_session_id: String,
    path: String,
) -> Result<Vec<VfsNode>, String> {
    if vfs_session_id == "local" {
        return list_local_dir(&path);
    }
    let config = state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .get(&vfs_session_id)
        .cloned()
        .ok_or_else(|| "VFS session not found".to_string())?;

    let ssh_session = open_ssh_session(&config)?;
    let sftp = ssh_session.sftp().map_err(|e| e.to_string())?;
    read_remote_dir(&sftp, &path)
}

#[tauri::command]
async fn vfs_start_transfer(
    state: State<'_, AppState>,
    request: VfsTransferRequest,
) -> Result<Vec<String>, String> {
    if request.entries.is_empty() {
        return Ok(Vec::new());
    }

    let config = state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .get(&request.vfs_session_id)
        .cloned()
        .ok_or_else(|| "VFS session not found".to_string())?;

    let mut task_ids = Vec::new();
    for entry in request.entries {
        let task_id = Uuid::new_v4().to_string();
        let local_path = if request.direction == "UPLOAD" {
            entry.path.clone()
        } else {
            Path::new(&request.local_base_path)
                .join(&entry.name)
                .to_string_lossy()
                .into_owned()
        };
        let remote_path = if request.direction == "UPLOAD" {
            join_remote_path(&request.remote_base_path, &entry.name)
        } else {
            entry.path.clone()
        };

        let task = Arc::new(Mutex::new(TransferTaskState {
            progress: TransferProgress {
                task_id: task_id.clone(),
                bytes_transferred: 0,
                bytes_total: entry.size,
                speed_bps: 0,
                status: "PENDING".into(),
                error_message: None,
                filename: entry.name.clone(),
                path: entry.path.clone(),
                direction: request.direction.clone(),
            },
            paused: false,
            cancelled: false,
            updated_at: now_ms(),
            completed_at: None,
        }));

        state
            .transfer_tasks
            .lock()
            .map_err(|_| "Failed to lock transfer tasks".to_string())?
            .insert(task_id.clone(), task.clone());

        spawn_transfer_task(
            task,
            config.clone(),
            request.direction.clone(),
            local_path,
            remote_path,
            entry.size,
        );
        task_ids.push(task_id);
    }

    Ok(task_ids)
}

#[tauri::command]
async fn vfs_describe_local_entries(paths: Vec<String>) -> Result<Vec<VfsTransferEntry>, String> {
    let mut entries = Vec::new();
    for path in paths {
        let target_path = PathBuf::from(&path);
        let metadata = fs::metadata(&target_path).map_err(|e| e.to_string())?;
        let name = target_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .ok_or_else(|| format!("Invalid local path: {}", path))?;
        entries.push(VfsTransferEntry {
            name,
            path,
            is_dir: metadata.is_dir(),
            size: if metadata.is_dir() {
                compute_local_total_size(&target_path)?
            } else {
                metadata.len()
            },
        });
    }
    Ok(entries)
}

#[tauri::command]
async fn vfs_rename_node(
    state: State<'_, AppState>,
    request: VfsRenameRequest,
) -> Result<String, String> {
    let is_local = request.vfs_session_id == "local";
    let next_path = build_sibling_path(&request.path, &request.next_name, !is_local)?;

    if is_local {
        fs::rename(&request.path, &next_path).map_err(|e| e.to_string())?;
        return Ok(next_path);
    }

    let config = state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .get(&request.vfs_session_id)
        .cloned()
        .ok_or_else(|| "VFS session not found".to_string())?;
    let ssh_session = open_ssh_session(&config)?;
    let sftp = ssh_session.sftp().map_err(|e| e.to_string())?;
    sftp.rename(Path::new(&request.path), Path::new(&next_path), None)
        .map_err(|e| e.to_string())?;
    Ok(next_path)
}

#[tauri::command]
async fn vfs_delete_nodes(
    state: State<'_, AppState>,
    request: VfsDeleteRequest,
) -> Result<(), String> {
    if request.paths.is_empty() {
        return Ok(());
    }

    if request.vfs_session_id == "local" {
        for path in request.paths {
            delete_local_path_recursive(Path::new(&path))?;
        }
        return Ok(());
    }

    let config = state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .get(&request.vfs_session_id)
        .cloned()
        .ok_or_else(|| "VFS session not found".to_string())?;
    let ssh_session = open_ssh_session(&config)?;
    let sftp = ssh_session.sftp().map_err(|e| e.to_string())?;
    for path in request.paths {
        delete_remote_path_recursive(&sftp, Path::new(&path))?;
    }
    Ok(())
}

#[tauri::command]
async fn vfs_create_dir(
    state: State<'_, AppState>,
    request: VfsCreateDirRequest,
) -> Result<String, String> {
    let safe_name = sanitize_child_name(&request.name)?;

    if request.vfs_session_id == "local" {
        let target = Path::new(&request.parent_path).join(&safe_name);
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        return Ok(target.to_string_lossy().into_owned());
    }

    let config = state
        .vfs_sessions
        .lock()
        .map_err(|_| "Failed to lock VFS sessions".to_string())?
        .get(&request.vfs_session_id)
        .cloned()
        .ok_or_else(|| "VFS session not found".to_string())?;
    let ssh_session = open_ssh_session(&config)?;
    let sftp = ssh_session.sftp().map_err(|e| e.to_string())?;
    let target = join_remote_path(&request.parent_path, &safe_name);
    create_remote_dir_if_missing(&sftp, Path::new(&target))?;
    Ok(target)
}

#[tauri::command]
async fn vfs_get_transfer_tasks(
    state: State<'_, AppState>,
) -> Result<Vec<TransferProgress>, String> {
    let mut tasks = state
        .transfer_tasks
        .lock()
        .map_err(|_| "Failed to lock transfer tasks".to_string())?;

    tasks.retain(|_, task| {
        task.lock()
            .map(|state| {
                state
                    .completed_at
                    .map(|completed_at| now_ms().saturating_sub(completed_at) < 12_000)
                    .unwrap_or(true)
            })
            .unwrap_or(false)
    });

    let mut list = tasks.values().filter_map(clone_transfer_progress).collect::<Vec<_>>();
    list.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(list)
}

#[tauri::command]
async fn vfs_control_task(
    state: State<'_, AppState>,
    task_id: String,
    action: String,
) -> Result<(), String> {
    let task = state
        .transfer_tasks
        .lock()
        .map_err(|_| "Failed to lock transfer tasks".to_string())?
        .get(&task_id)
        .cloned()
        .ok_or_else(|| "Transfer task not found".to_string())?;

    update_transfer_state(&task, |state| match action.as_str() {
        "PAUSE" => {
            state.paused = true;
            state.progress.status = "PAUSED".into();
            state.progress.speed_bps = 0;
        }
        "RESUME" => {
            state.paused = false;
            state.progress.status = "TRANSFERRING".into();
        }
        "CANCEL" => {
            state.cancelled = true;
            state.paused = false;
            state.progress.status = "FAILED".into();
            state.progress.error_message = Some("Transfer cancelled".into());
            state.progress.speed_bps = 0;
            state.completed_at = Some(now_ms());
        }
        _ => {}
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            vfs_sessions: Arc::new(Mutex::new(HashMap::new())),
            transfer_tasks: Arc::new(Mutex::new(HashMap::new())),
        })
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                resize_main_window(&window)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_term_stream,
            write_term_stream,
            resize_term_stream,
            close_term_stream,
            read_term_backlog,
            create_bookmark_group,
            rename_bookmark_group,
            delete_bookmark_group,
            get_quick_commands,
            save_quick_command,
            delete_quick_command,
            save_bookmark,
            get_bookmark_tree,
            delete_bookmark,
            duplicate_bookmark,
            vfs_connect,
            vfs_disconnect,
            vfs_list_dir,
            vfs_start_transfer,
            vfs_describe_local_entries,
            vfs_rename_node,
            vfs_delete_nodes,
            vfs_create_dir,
            vfs_get_transfer_tasks,
            vfs_control_task,
            toggle_devtools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
