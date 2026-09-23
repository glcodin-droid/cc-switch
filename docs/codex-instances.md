# Codex instances — community fork

Manage existing Codex desktop environments from one CC Switch window without
switching the global Codex configuration directory. Each environment keeps its
own config, authentication, conversations, and Electron data.

## Usage

1. Select **Codex**. The top bar now has an instance menu styled like the existing
   project picker. **Default instance** retains the original global provider flow.
2. Choose **Register existing instance** in that menu. Enter a name, an existing
   absolute config directory containing `config.toml`, and a separate desktop-data
   directory. Optionally choose an installed macOS app/launcher.
3. Select the registered instance. The main page uses the original provider cards;
   it imports the current config as the first card without copying its login.
4. Use the normal **Add**, **Edit**, **Duplicate**, **Enable**, and **Delete** controls.
   Cards and the active-provider marker belong to that instance. Editing the active
   card updates its `config.toml`; saving an inactive card only updates that
   instance's provider library. Enabling a card writes its routing/model settings
   while retaining the target home's unrelated settings.
5. Launch from the instance menu. Restart the corresponding Codex after config
   changes. An environment-key setup should use its existing `.app` launcher;
   its hardcoded paths must match the registration.

The instance menu persists its selection locally. **Instance settings** lists
registrations and launch actions. Unregistering does not delete config or history.
To correct directory details, unregister and register again.

## Configuration boundaries

- Each registered instance has an independent provider library in
  `instance-providers/<instance-id>.json`, next to CC Switch's database. These
  files may contain API keys and are written with private Unix permissions.
- Current disk config is loaded into the active card; edited files are not
  silently replaced by old library content. Revision conflicts require reload.
- Model mappings generate content-addressed catalogs inside the selected home;
  no other instance's catalog is changed. User-owned catalog pointers require an
  explicit decision before replacing them with generated mappings.
- Global common-config overlays are disabled in instance forms. Full TOML and
  its headers, MCP, plugins, hooks, and project entries stay with that home.
- Login/session files are not rewritten. Official presets use that instance's
  existing login. Managed OAuth and proxy-only providers are rejected rather
  than silently binding an instance to the one global proxy.
- The separate global MCP/Skills/settings panels retain their original scope.
  This release changes provider/config management, not all global management APIs.
- Only Codex is adapted in this release. The instance menu component is reusable
  without pretending Claude or other apps have working instance adapters.

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

## Release and installation

Version `3.20.4-codex.1` is a macOS Apple Silicon prerelease named **CC Switch Codex**.
Download ZIP or DMG from https://github.com/glcodin-droid/cc-switch/releases.
This community build uses an ad-hoc signature, not Apple Developer ID notarization.
macOS may require an explicit user decision in Privacy & Security on first open.

This build reuses the existing `~/.cc-switch` provider database and settings. Quit
the original CC Switch before opening the fork; do not run both managers against
the same database. Your multiple Codex instances can still run simultaneously.
The fork has its own application identifier and URL scheme. Updates are manual
from this fork’s releases; the upstream automatic updater is not loaded.

The first supported adapter is Codex. `InstanceSelector` is reusable by other
apps, but their config and launch adapters are not implemented in this release.

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

Build macOS artifacts after the test gates with `bash scripts/build-codex-release.sh`.
Use the pinned Rust toolchain and pnpm version. This creates ZIP, DMG and SHA256SUMS.txt,
without uploading them. Upstream signing workflows are disabled on this fork.
