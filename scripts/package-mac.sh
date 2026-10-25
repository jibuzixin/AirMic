#!/usr/bin/env bash
# 把电脑端打成 AirMic.app（菜单栏应用，不占 Dock）
#
#   ./scripts/package-mac.sh [debug|release] [输出目录]
#
# 不需要完整 Xcode：SwiftPM 编译 + 手工组装 .app bundle + ad-hoc 签名。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${1:-release}"
OUT_ROOT="${2:-$ROOT/dist/mac}"
APP_NAME="AirMic"
BUNDLE_ID="com.airmic.mac"
VERSION="0.3.1"
BUILD_DIR="$ROOT/mac/.build/$CONFIG"
OUT_DIR="$OUT_ROOT"
APP_BUNDLE="$OUT_DIR/$APP_NAME-$VERSION.app"

log() { printf '\033[1;34m[package]\033[0m %s\n' "$*"; }

log "编译（$CONFIG）…"
swift build --package-path "$ROOT/mac" -c "$CONFIG"

log "组装 .app bundle…"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$BUILD_DIR/AirMac" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

cat > "$APP_BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>$APP_NAME</string>
    <key>CFBundleDisplayName</key>
    <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>
    <string>$BUNDLE_ID</string>
    <key>CFBundleExecutable</key>
    <string>$APP_NAME</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <!-- 菜单栏应用：不占 Dock、不在 Cmd-Tab 里 -->
    <key>LSUIElement</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>AirMic</string>
</dict>
</plist>
PLIST

# 签名
#
# ⚠️ 优先用项目内的自签名证书（scripts/setup-signing.sh 生成）。
# 原因：ad-hoc 签名的身份是 cdhash，每次重新编译都会变 ——
# macOS 的「辅助功能」授权绑定在签名身份上，一重打包授权就失效。
# 自签名证书的指定要求是 `identifier + certificate leaf`，跨重打包稳定，
# 授权一次之后就不用再授权了。
SIGN_KC="$ROOT/.toolchain/signing/airmic.keychain-db"
SIGN_ID="AirMic Dev"

sign_with_dev_cert() {
  security unlock-keychain -p airmic "$SIGN_KC" >/dev/null 2>&1 || true

  # codesign 只会去钥匙串搜索列表里找身份 —— 临时把项目钥匙串加进去，
  # 签完立刻恢复，避免污染用户的登录钥匙串设置。
  local original
  original="$(security list-keychains -d user | tr -d '"' | tr '\n' ' ')"
  restore_keychains() { security list-keychains -d user -s $original >/dev/null 2>&1 || true; }
  trap restore_keychains EXIT
  security list-keychains -d user -s $original "$SIGN_KC" >/dev/null 2>&1

  codesign --force --deep --sign "$SIGN_ID" --timestamp=none "$APP_BUNDLE"
  restore_keychains
  trap - EXIT
}

if [ -f "$SIGN_KC" ]; then
  log "签名（$SIGN_ID）…"
  sign_with_dev_cert || { log "自签名失败，退回 ad-hoc"; codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true; }
else
  log "ad-hoc 签名（没有找到自签名证书，可以跑 scripts/setup-signing.sh）…"
  codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || log "签名跳过（codesign 不可用）"
fi

log "完成：$APP_BUNDLE"
echo
echo "运行： open \"$APP_BUNDLE\""
echo "注意：首次点磁贴执行快捷键时，系统会要求授「辅助功能」权限。"
