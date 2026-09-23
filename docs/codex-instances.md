# Codex instances (experimental fork)

Manage existing Codex desktop environments from one CC Switch window without
switching the global Codex configuration directory. Each environment keeps its
own config, authentication, conversations, and Electron data.

## Usage

1. Open **Codex → Codex instances**. The normal provider page still controls only
   the global directory configured in CC Switch Settings.
2. Register each existing instance with a name, absolute config directory
   containing `config.toml`, and a separate Electron desktop data directory.
3. Optionally set an installed macOS `.app` path for launching. If an instance
   needs an environment-provided API key, use its existing `.app` launcher that
   reads the key. Its paths must match the registered directories.
4. Select an instance. Edit model/effort and **Update draft**, or edit TOML directly.
5. Check the save target and **Save to this instance**. Restart the corresponding
   Codex to load the change. **Launch instance** sends its `CODEX_HOME` and
   `CODEX_ELECTRON_USER_DATA_PATH` to macOS `open`, without changing global
   environment variables or stopping any running instance.

Example paths (use your own username and the actual paths from your launchers):

| Instance | Config directory | Desktop data directory |
| --- | --- | --- |
| Personal | `/Users/you/.codex` | `/Users/you/Library/Application Support/Codex` |
| Work | `/Users/you/.codex-work` | `/Users/you/Library/Application Support/Codex Work` |

The feature registers existing homes; it does not copy conversations or create
a new login. To change a registration, unregister it and register the same home
with the corrected details. Files stay on disk.

## Presets and isolation

- Saved CC Switch providers can be loaded into a draft. Only connection, model,
  and reasoning/context fields are imported. MCP, hooks, plugins, project trust,
  and other instance settings remain in the target TOML.
- Direct Responses keys use the existing provider-scoped credential conversion.
  `auth.json` is never written. Official presets use the target's existing login;
  managed OAuth and proxy-only presets are rejected.
- Model catalog paths are not copied from another home. Configure a compatible
  catalog inside the target home explicitly if needed.
- The global current-provider marker, proxy, failover queue, profile snapshots,
  and directory override are unchanged. Preset edits are not silently pushed to
  registered homes; load the updated preset and save there.
- Registration is local in `codex-instances.json` beside CC Switch's database.
  **Unregister** removes the entry, never the config, credentials, or history.

## Save safety and recovery

TOML is validated and the loaded revision checked against current disk content.
The previous config is backed up to `<home>/cc-switch-backups/` before an atomic
write. Config and backup files use mode `0600` on Unix. External edits produce a
conflict: reload and reapply the intended changes. To restore, close that instance
and copy the desired backup over its `config.toml`.

The final rename is atomic, but external programs do not participate in the write
mutex; this is not a cross-process locking protocol. Duplicate/overlapping homes
and symlinked config files are rejected. Directory mappings are revalidated at
launch.

## Validation

```sh
pnpm typecheck
pnpm test:unit
cargo test --manifest-path src-tauri/Cargo.toml --lib codex_instances::tests
```

The macOS UI smoke test uses two synthetic config homes and a harmless `.app`
launcher that records only the two directory variables. Verify registration,
switching, save/reload, retained headers and MCP, unchanged auth files, backup
creation, and launch environment. This does not exercise an upstream model API
or claim to fix cross-model encrypted-compaction behavior.

Launching is macOS-only. Windows/Linux launching is not implemented or validated.
