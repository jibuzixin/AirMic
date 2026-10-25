#!/usr/bin/env bash
# 发布一个 GitHub Release（需要先配好 remote 和 gh 登录）
#
#   ./scripts/release.sh            # 直接发布
#   ./scripts/release.sh --draft    # 先发草稿，确认后再手动发布
#
# 依赖：gh（GitHub CLI）、已推到远端的 main、dist/ 里的产物。
# 产物由 ./scripts/package-mac.sh 和 Android 构建生成：
#   dist/mac/AirMic-<版本>.app
#   dist/AirMic-v<版本>-debug.apk
# 这个脚本会自己打 macOS zip 和 SHA256SUMS。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(sed -n 's/^VERSION="\(.*\)"$/\1/p' "$ROOT/scripts/package-mac.sh" | head -1)"
APP="$ROOT/dist/mac/AirMic-$VERSION.app"
ZIP="$ROOT/dist/AirMic-$VERSION-macOS.zip"
APK="$ROOT/dist/AirMic-v$VERSION-debug.apk"
SUMS="$ROOT/dist/SHA256SUMS.txt"
NOTES="$ROOT/docs/release-notes-$VERSION.md"

log() { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[release]\033[0m %s\n' "$*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || fail "没有安装 gh（GitHub CLI）：https://cli.github.com/"
git -C "$ROOT" remote get-url origin >/dev/null 2>&1 || fail "还没有配置 git remote origin"
[ -f "$APP" ] || fail "找不到 $APP，先跑 ./scripts/package-mac.sh"
[ -f "$APK" ] || fail "找不到 $APK，先构建 Android APK"
[ -f "$NOTES" ] || fail "找不到发布说明 $NOTES"

log "打包 macOS 应用…"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

log "生成校验和…"
( cd "$ROOT/dist" && shasum -a 256 "$(basename "$ZIP")" "$(basename "$APK")" > "$(basename "$SUMS")" )

log "检查 GitHub 登录…"
gh auth status >/dev/null 2>&1 || fail "gh 还没登录：先运行 gh auth login"

ARGS=(
  "v$VERSION"
  "$ZIP"
  "$APK"
  "$SUMS"
  --title "AirMic $VERSION"
  --notes-file "$NOTES"
)
if [ "${1:-}" = "--draft" ]; then
  ARGS+=(--draft)
fi

log "创建 Release v$VERSION…"
gh release create "${ARGS[@]}"
log "完成"
