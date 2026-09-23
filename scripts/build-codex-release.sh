#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'This release script is validated only on macOS Apple Silicon.' >&2
  exit 1
fi
version=$(node -p "require('./package.json').version")
pnpm tauri build --bundles app
app='src-tauri/target/release/bundle/macos/CC Switch Codex.app'
# Community release: ad-hoc identity, no claim of Developer ID notarization.
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
mkdir -p release
prefix="CC-Switch-Codex-${version}-macOS-arm64"
ditto -c -k --sequesterRsrc --keepParent "$app" "release/${prefix}.zip"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
ditto "$app" "$staging/CC Switch Codex.app"
ln -s /Applications "$staging/Applications"
hdiutil create -volname 'CC Switch Codex' -srcfolder "$staging" -ov -format UDZO "release/${prefix}.dmg"
(cd release && shasum -a 256 "${prefix}.zip" "${prefix}.dmg" > SHA256SUMS.txt)
echo "Release assets prepared in release/ (not uploaded)."
