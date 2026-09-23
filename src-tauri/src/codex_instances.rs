//! Independent Codex homes. Every operation resolves an instance ID to its own
//! path; selecting an instance never changes CC Switch's global Codex directory.
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use toml_edit::{DocumentMut, Item};

use crate::{
    config::{atomic_write_private, get_app_config_dir},
    error::AppError,
};

// ponytail: serialize this small local registry and its writes; move to per-home
// locks only if simultaneous instance edits become a measured bottleneck.
static OPERATIONS: Mutex<()> = Mutex::new(());
const MAX_CONFIG_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexInstance {
    pub id: String,
    pub name: String,
    pub config_dir: PathBuf,
    pub user_data_dir: PathBuf,
    pub app_path: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    pub instance: CodexInstance,
    pub config: String,
    pub revision: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub effort: Option<String>,
}

fn invalid(zh: &str, en: &str) -> AppError {
    AppError::localized("codex.instances.invalid", zh, en)
}

fn registry_path() -> PathBuf {
    get_app_config_dir().join("codex-instances.json")
}

fn read_registry(path: &Path) -> Result<Vec<CodexInstance>, AppError> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let bytes = fs::read(path).map_err(|e| AppError::io(path, e))?;
    serde_json::from_slice(&bytes).map_err(|e| AppError::json(path, e))
}

fn write_registry(path: &Path, instances: &[CodexInstance]) -> Result<(), AppError> {
    let bytes = serde_json::to_vec_pretty(instances)
        .map_err(|source| AppError::JsonSerialize { source })?;
    atomic_write_private(path, &bytes)
}

fn get_instance(id: &str) -> Result<CodexInstance, AppError> {
    read_registry(&registry_path())?
        .into_iter()
        .find(|i| i.id == id)
        .ok_or_else(|| {
            invalid(
                "未找到实例，请重新加载",
                "Instance not found; reload the list",
            )
        })
}

fn absolute_path(value: &Path) -> Result<PathBuf, AppError> {
    if !value.is_absolute()
        || value
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(invalid(
            "请填写不含 .. 的绝对路径",
            "Use an absolute path without ..",
        ));
    }
    Ok(value.to_path_buf())
}

fn config_path(home: &Path) -> Result<PathBuf, AppError> {
    let resolved = fs::canonicalize(home).map_err(|e| AppError::io(home, e))?;
    if resolved != home {
        return Err(invalid(
            "实例目录已移动或变为软链接，请重新登记",
            "Instance directory changed; register it again",
        ));
    }
    let path = home.join("config.toml");
    let meta = fs::symlink_metadata(&path).map_err(|e| AppError::io(&path, e))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_CONFIG_BYTES {
        return Err(invalid(
            "config.toml 必须是小于 2 MiB 的普通文件，不能使用软链接",
            "config.toml must be a regular file under 2 MiB, not a symlink",
        ));
    }
    Ok(path)
}

fn resolved_data_dir(path: &Path) -> Result<PathBuf, AppError> {
    absolute_path(path)?;
    if path.exists() {
        return fs::canonicalize(path).map_err(|e| AppError::io(path, e));
    }
    let parent = path
        .parent()
        .ok_or_else(|| invalid("无效数据目录", "Invalid data directory"))?;
    Ok(resolved_data_dir(parent)?.join(
        path.file_name()
            .ok_or_else(|| invalid("无效数据目录", "Invalid data directory"))?,
    ))
}

fn overlaps(a: &Path, b: &Path) -> bool {
    a.starts_with(b) || b.starts_with(a)
}

fn validate_instance(
    mut item: CodexInstance,
    existing: &[CodexInstance],
) -> Result<CodexInstance, AppError> {
    item.name = item.name.trim().to_owned();
    if item.name.is_empty() || item.name.len() > 120 {
        return Err(invalid(
            "实例名称不能为空或超过 120 字节",
            "Instance name must be 1–120 bytes",
        ));
    }
    absolute_path(&item.config_dir)?;
    item.config_dir =
        fs::canonicalize(&item.config_dir).map_err(|e| AppError::io(&item.config_dir, e))?;
    config_path(&item.config_dir)?;
    item.user_data_dir = resolved_data_dir(&item.user_data_dir)?;
    if overlaps(&item.config_dir, &item.user_data_dir)
        || existing.iter().any(|other| {
            [&item.config_dir, &item.user_data_dir].iter().any(|new| {
                [&other.config_dir, &other.user_data_dir]
                    .iter()
                    .any(|old| overlaps(new, old))
            })
        })
    {
        return Err(invalid(
            "配置目录和桌面数据目录必须独立，不能与其他实例重叠",
            "Config and desktop data directories must not overlap any instance",
        ));
    }
    if let Some(app) = item.app_path.as_ref() {
        absolute_path(app)?;
        if app.extension().and_then(|s| s.to_str()) != Some("app")
            || !app.join("Contents/Info.plist").is_file()
        {
            return Err(invalid(
                "请选择已安装的 macOS .app 或现有启动器",
                "Choose an installed macOS .app or existing launcher",
            ));
        }
    }
    Ok(item)
}

fn snapshot(item: CodexInstance) -> Result<InstanceConfig, AppError> {
    let path = config_path(&item.config_dir)?;
    let config = fs::read_to_string(&path).map_err(|e| AppError::io(&path, e))?;
    let doc = config.parse::<DocumentMut>().map_err(|_| {
        invalid(
            "实例配置不是有效 TOML，请先修复",
            "Instance config is not valid TOML",
        )
    })?;
    let text = |key: &str| doc.get(key).and_then(Item::as_str).map(str::to_owned);
    Ok(InstanceConfig {
        revision: revision(&config),
        model: text("model"),
        provider: text("model_provider"),
        effort: text("model_reasoning_effort"),
        config,
        instance: item,
    })
}

fn revision(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn save_config(
    item: CodexInstance,
    expected: &str,
    text: &str,
) -> Result<InstanceConfig, AppError> {
    if text.len() as u64 > MAX_CONFIG_BYTES {
        return Err(invalid("配置过大", "Config exceeds size limit"));
    }
    text.parse::<DocumentMut>()
        .map_err(|_| invalid("TOML 格式有误，未保存", "Invalid TOML; nothing saved"))?;
    let before = snapshot(item.clone())?;
    if before.revision != expected {
        return Err(invalid(
            "配置已被其他程序修改，请重新加载后再保存",
            "Config changed externally; reload before saving",
        ));
    }
    if text == before.config {
        return Ok(before);
    }
    let path = config_path(&item.config_dir)?;
    // Keep the backup beside the selected home. No credential/history files are
    // copied, deleted, or shared with another instance.
    let backup = item
        .config_dir
        .join("cc-switch-backups")
        .join(format!("config-{}.toml", uuid::Uuid::new_v4()));
    if backup.parent().is_some_and(|p| p.is_symlink()) {
        return Err(invalid(
            "备份目录不能是软链接",
            "Backup directory must not be a symlink",
        ));
    }
    atomic_write_private(&backup, before.config.as_bytes())?;
    // Catch edits made while the backup was being written. External programs
    // do not share our lock; like the existing writer, final replace is atomic.
    if snapshot(item.clone())?.revision != expected {
        return Err(invalid(
            "保存期间配置发生变化，请重新加载",
            "Config changed during save; reload",
        ));
    }
    atomic_write_private(&path, text.as_bytes())?;
    snapshot(item)
}

#[tauri::command]
pub fn list_codex_instances() -> Result<Vec<CodexInstance>, String> {
    read_registry(&registry_path()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn register_codex_instance(
    name: String,
    config_dir: PathBuf,
    user_data_dir: PathBuf,
    app_path: Option<PathBuf>,
) -> Result<CodexInstance, String> {
    let _guard = OPERATIONS.lock().map_err(|e| e.to_string())?;
    let path = registry_path();
    let mut list = read_registry(&path).map_err(|e| e.to_string())?;
    let item = validate_instance(
        CodexInstance {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            config_dir,
            user_data_dir,
            app_path,
        },
        &list,
    )
    .map_err(|e| e.to_string())?;
    list.push(item.clone());
    write_registry(&path, &list).map_err(|e| e.to_string())?;
    Ok(item)
}

#[tauri::command]
pub fn forget_codex_instance(id: String) -> Result<(), String> {
    let _guard = OPERATIONS.lock().map_err(|e| e.to_string())?;
    let path = registry_path();
    let mut list = read_registry(&path).map_err(|e| e.to_string())?;
    list.retain(|i| i.id != id);
    write_registry(&path, &list).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_codex_instance(id: String) -> Result<InstanceConfig, String> {
    snapshot(get_instance(&id).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_codex_instance(
    id: String,
    expected_revision: String,
    config: String,
) -> Result<InstanceConfig, String> {
    let _guard = OPERATIONS.lock().map_err(|e| e.to_string())?;
    save_config(
        get_instance(&id).map_err(|e| e.to_string())?,
        &expected_revision,
        &config,
    )
    .map_err(|e| e.to_string())
}

/// Import only routing fields, never another instance's MCP, skills, hooks,
/// project trust, login cache, or model-catalog path. The result is a draft.
pub fn preset_config(
    current: &str,
    provider: &crate::provider::Provider,
) -> Result<String, AppError> {
    if crate::proxy::providers::should_convert_codex_responses_to_chat(provider, "/responses")
        || crate::proxy::providers::should_convert_codex_responses_to_anthropic(
            provider,
            "/responses",
        )
    {
        return Err(invalid(
            "此供应商需要全局代理转换，不能直接应用到独立实例",
            "This provider needs the global conversion proxy and cannot be applied directly",
        ));
    }
    if provider.uses_managed_account_auth() {
        return Err(invalid(
            "实例请沿用自己的登录；不支持复制托管账号认证",
            "Keep the instance's own login; managed OAuth presets cannot be copied",
        ));
    }
    let raw = provider
        .settings_config
        .get("config")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let empty = serde_json::json!({});
    let auth = provider.settings_config.get("auth").unwrap_or(&empty);
    let prepared = crate::codex_config::prepare_codex_provider_live_config(auth, raw)?;
    let source = prepared
        .parse::<DocumentMut>()
        .map_err(|_| invalid("供应商 TOML 无效", "Invalid provider TOML"))?;
    let mut target = current
        .parse::<DocumentMut>()
        .map_err(|_| invalid("实例 TOML 无效", "Invalid instance TOML"))?;
    let id = source
        .get("model_provider")
        .and_then(Item::as_str)
        .unwrap_or("openai");
    if let Some(table) = source.get("model_providers").and_then(|p| p.get(id)) {
        if table
            .get("wire_api")
            .and_then(Item::as_str)
            .is_some_and(|w| w != "responses")
        {
            return Err(invalid(
                "独立实例只支持直接连接 Responses 供应商",
                "Independent instances require native Responses providers",
            ));
        }
        let mut providers = match target.remove("model_providers") {
            Some(value) => value.into_table().map_err(|_| {
                invalid(
                    "model_providers 必须是表",
                    "model_providers must be a table",
                )
            })?,
            None => toml_edit::Table::new(),
        };
        providers.insert(id, table.clone());
        target["model_providers"] = Item::Table(providers);
    }
    // Do not inherit a stale forced base URL when selecting another provider.
    target.remove("openai_base_url");
    target["model_provider"] = toml_edit::value(id);
    for key in [
        "model",
        "model_reasoning_effort",
        "model_verbosity",
        "model_context_window",
        "model_auto_compact_token_limit",
        "model_max_output_tokens",
    ] {
        if let Some(value) = source.get(key) {
            target[key] = value.clone();
        }
    }
    Ok(target.to_string())
}

#[tauri::command]
pub fn preview_codex_instance_provider(
    state: tauri::State<'_, crate::store::AppState>,
    config: String,
    provider_id: String,
) -> Result<String, String> {
    let providers = state
        .db
        .get_all_providers("codex")
        .map_err(|e| e.to_string())?;
    let provider = providers.get(&provider_id).ok_or("Provider not found")?;
    preset_config(&config, provider).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn edit_codex_instance_model(
    config: String,
    model: String,
    effort: String,
) -> Result<String, String> {
    if model.trim().is_empty()
        || ![
            "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra",
        ]
        .contains(&effort.as_str())
    {
        return Err(invalid(
            "请填写模型并选择推理强度",
            "Enter a model and select a reasoning effort",
        )
        .to_string());
    }
    let mut doc = config
        .parse::<DocumentMut>()
        .map_err(|_| invalid("TOML 格式有误", "Invalid TOML").to_string())?;
    doc["model"] = toml_edit::value(model.trim());
    doc["model_reasoning_effort"] = toml_edit::value(effort);
    Ok(doc.to_string())
}

fn launch_args(item: &CodexInstance) -> Vec<String> {
    vec![
        "-n".into(),
        "--env".into(),
        format!("CODEX_HOME={}", item.config_dir.display()),
        "--env".into(),
        format!(
            "CODEX_ELECTRON_USER_DATA_PATH={}",
            item.user_data_dir.display()
        ),
        item.app_path
            .as_ref()
            .unwrap()
            .to_string_lossy()
            .into_owned(),
        "--args".into(),
        format!("--user-data-dir={}", item.user_data_dir.display()),
    ]
}

#[tauri::command]
pub fn launch_codex_instance(id: String) -> Result<(), String> {
    let item = get_instance(&id).map_err(|e| e.to_string())?;
    snapshot(item.clone()).map_err(|e| e.to_string())?;
    let others: Vec<_> = read_registry(&registry_path())
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|i| i.id != id)
        .collect();
    let checked = validate_instance(item.clone(), &others).map_err(|e| e.to_string())?;
    if checked.user_data_dir != item.user_data_dir {
        return Err(invalid(
            "桌面数据目录发生变化，请重新登记",
            "Desktop data directory changed; register again",
        )
        .to_string());
    }
    if item.app_path.is_none() {
        return Err(invalid(
            "请先登记应用或启动器路径",
            "Register an app/launcher path first",
        )
        .to_string());
    }
    #[cfg(target_os = "macos")]
    {
        // No shell evaluation, no global launchctl environment, no process kill.
        let result = std::process::Command::new("/usr/bin/open")
            .args(launch_args(&item))
            .status()
            .map_err(|e| e.to_string())?;
        if result.success() {
            Ok(())
        } else {
            Err(invalid("应用启动失败", "Application launch failed").to_string())
        }
    }
    #[cfg(not(target_os = "macos"))]
    Err(invalid(
        "此版本只在 macOS 支持启动实例",
        "Instance launching is currently supported on macOS only",
    )
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn instance(root: &Path, name: &str) -> CodexInstance {
        let home = root.join(name);
        fs::create_dir(&home).unwrap();
        fs::write(
            home.join("config.toml"),
            "model = \"gpt-6-astra\"\nmodel_reasoning_effort = \"xhigh\"\n",
        )
        .unwrap();
        fs::write(home.join("auth.json"), "keep-login").unwrap();
        CodexInstance {
            id: name.into(),
            name: name.into(),
            config_dir: fs::canonicalize(home).unwrap(),
            user_data_dir: root.join(format!("{name}-desktop")),
            app_path: None,
        }
    }
    #[test]
    fn independent_writes_preserve_other_home_auth_and_back_up() {
        let temp = tempfile::tempdir().unwrap();
        let a = instance(temp.path(), "a");
        let b = instance(temp.path(), "b");
        let original = snapshot(a.clone()).unwrap();
        let text = original.config.replace("gpt-6-astra", "gpt-5.6-sol");
        let saved = save_config(a.clone(), &original.revision, &text).unwrap();
        assert_eq!(saved.model.as_deref(), Some("gpt-5.6-sol"));
        assert_eq!(
            snapshot(b.clone()).unwrap().model.as_deref(),
            Some("gpt-6-astra")
        );
        for item in [&a, &b] {
            assert_eq!(
                fs::read_to_string(item.config_dir.join("auth.json")).unwrap(),
                "keep-login"
            );
        }
        let backup = fs::read_dir(a.config_dir.join("cc-switch-backups"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read_to_string(&backup).unwrap(), original.config);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(backup).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    #[test]
    fn stale_edits_and_invalid_toml_do_not_overwrite_config() {
        let temp = tempfile::tempdir().unwrap();
        let a = instance(temp.path(), "a");
        let old = snapshot(a.clone()).unwrap();
        assert!(save_config(a.clone(), &old.revision, "[broken").is_err());
        fs::write(
            a.config_dir.join("config.toml"),
            "model = 'external-edit'\n",
        )
        .unwrap();
        assert!(save_config(a.clone(), &old.revision, "model = 'lost-update'").is_err());
        assert_eq!(snapshot(a).unwrap().model.as_deref(), Some("external-edit"));
    }
    #[test]
    fn duplicate_and_overlapping_directories_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let a = instance(temp.path(), "a");
        let a = validate_instance(a, &[]).unwrap();
        assert!(validate_instance(a.clone(), &[a.clone()]).is_err());
        let mut b = instance(temp.path(), "b");
        b.user_data_dir = a.user_data_dir.clone();
        assert!(validate_instance(b, &[a]).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn replaced_home_or_symlinked_config_is_rejected() {
        use std::os::unix::fs::symlink;
        let temp = tempfile::tempdir().unwrap();
        let a = instance(temp.path(), "a");
        let b = instance(temp.path(), "b");
        fs::remove_file(a.config_dir.join("config.toml")).unwrap();
        symlink(
            b.config_dir.join("config.toml"),
            a.config_dir.join("config.toml"),
        )
        .unwrap();
        assert!(snapshot(a).is_err());
    }
    #[test]
    fn registry_roundtrip_and_forget_do_not_delete_homes() {
        let temp = tempfile::tempdir().unwrap();
        let a = instance(temp.path(), "a");
        let file = temp.path().join("instances.json");
        write_registry(&file, &[a.clone()]).unwrap();
        assert_eq!(read_registry(&file).unwrap()[0].id, a.id);
        write_registry(&file, &[]).unwrap();
        assert!(a.config_dir.join("config.toml").exists());
        fs::write(file.clone(), "invalid json").unwrap();
        assert!(read_registry(&file).is_err());
    }
    #[test]
    fn preset_preserves_instance_headers_and_unrelated_settings() {
        let provider = crate::provider::Provider::with_id(
            "p".into(),
            "P".into(),
            serde_json::json!({"auth":{"OPENAI_API_KEY":"test-key"},"config":"model_provider='new'\nmodel='new-model'\n[model_providers.new]\nname='New'\nbase_url='https://example.test'\nwire_api='responses'\n[model_providers.new.http_headers]\nx-source='test'\n"}),
            None,
        );
        let current = "# keep comment\nmodel='old'\nmodel_reasoning_effort='xhigh'\n[mcp_servers.local]\ncommand='echo'\n[features]\nhooks=true\n";
        let result = preset_config(current, &provider).unwrap();
        let doc: DocumentMut = result.parse().unwrap();
        assert!(result.contains("# keep comment"));
        assert_eq!(
            doc["mcp_servers"]["local"]["command"].as_str(),
            Some("echo")
        );
        assert_eq!(doc["model_reasoning_effort"].as_str(), Some("xhigh"));
        assert_eq!(
            doc["model_providers"]["new"]["http_headers"]["x-source"].as_str(),
            Some("test")
        );
        assert_eq!(
            doc["model_providers"]["new"]["experimental_bearer_token"].as_str(),
            Some("test-key")
        );
    }
    #[test]
    fn launch_arguments_isolate_both_homes_without_shell_interpolation() {
        let temp = tempfile::tempdir().unwrap();
        let mut a = instance(temp.path(), "a with spaces");
        a.app_path = Some(PathBuf::from("/Applications/Codex LLMBox.app"));
        let args = launch_args(&a);
        assert!(args.contains(&format!("CODEX_HOME={}", a.config_dir.display())));
        assert!(args.contains(&format!(
            "CODEX_ELECTRON_USER_DATA_PATH={}",
            a.user_data_dir.display()
        )));
        assert!(args.contains(&"/Applications/Codex LLMBox.app".to_owned()));
        assert!(!args.contains(&"-c".to_owned()));
    }

    #[test]
    fn preset_handles_inline_tables_and_rejects_proxy_only_formats() {
        let mut provider = crate::provider::Provider::with_id(
            "p".into(),
            "P".into(),
            serde_json::json!({
                "auth": {},
                "config": "model_provider='new'\n[model_providers.new]\nname='New'\nwire_api='responses'\nbase_url='https://example.test'\n"
            }),
            None,
        );
        let current =
            "model_providers = { old = {name='Old', wire_api='responses'} }\nmodel='old'\n";
        let output = preset_config(current, &provider).unwrap();
        let doc: DocumentMut = output.parse().unwrap();
        assert_eq!(doc["model_providers"]["old"]["name"].as_str(), Some("Old"));
        assert_eq!(doc["model_providers"]["new"]["name"].as_str(), Some("New"));
        provider.meta = Some(crate::provider::ProviderMeta {
            api_format: Some("chat_completions".into()),
            ..Default::default()
        });
        assert!(preset_config(current, &provider).is_err());
    }
}
