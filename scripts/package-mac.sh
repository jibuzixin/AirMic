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
BUILD_DIR="$ROOT/mac/.build/$CONFIG"
OUT_DIR="$OUT_ROOT"
APP_BUNDLE="$OUT_DIR/$APP_NAME.app"

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
    <string>0.1.0</string>
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

# ad-hoc 签名：本地跑得起来；分发给别人的时候要换成开发者证书
log "ad-hoc 签名…"
codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || log "签名跳过（codesign 不可用）"

log "完成：$APP_BUNDLE"
echo
echo "运行： open \"$APP_BUNDLE\""
echo "注意：首次点磁贴执行快捷键时，系统会要求授「辅助功能」权限。"
