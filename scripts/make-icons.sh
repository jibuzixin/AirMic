#!/usr/bin/env bash
# 从 assets/icon.svg 生成两端需要的图标尺寸
#
#   ./scripts/make-icons.sh
#
# 产物：
#   assets/AppIcon.icns                                 macOS 应用图标
#   android/.../mipmap-*/ic_launcher.png                安卓传统图标
#   android/.../mipmap-*/ic_launcher_round.png          安卓圆形图标（老系统）
#   android/.../mipmap-*/ic_launcher_foreground.png     安卓自适应图标前景

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/assets"
BUILD="$ASSETS/build"
RES="$ROOT/android/android/app/src/main/res"

mkdir -p "$BUILD"

log() { printf '\033[1;34m[icons]\033[0m %s\n' "$*"; }

render() {
  sips -s format png "$1" --out "$2" >/dev/null
}

resize() {
  sips -z "$2" "$2" "$1" --out "$3" >/dev/null
}

# ---- 1024 母版 ----
log "渲染母版…"
render "$ASSETS/icon.svg" "$BUILD/icon-1024.png"
render "$ASSETS/icon-round.svg" "$BUILD/icon-round-1024.png"
render "$ASSETS/icon-foreground.svg" "$BUILD/icon-fg-1024.png"

# ---- macOS .icns ----
log "生成 macOS 图标…"
ICONSET="$BUILD/AppIcon.iconset"
mkdir -p "$ICONSET"
for spec in \
  "16:icon_16x16" "32:icon_16x16@2x" \
  "32:icon_32x32" "64:icon_32x32@2x" \
  "128:icon_128x128" "256:icon_128x128@2x" \
  "256:icon_256x256" "512:icon_256x256@2x" \
  "512:icon_512x512" "1024:icon_512x512@2x"; do
  size="${spec%%:*}"
  name="${spec##*:}"
  resize "$BUILD/icon-1024.png" "$size" "$ICONSET/$name.png"
done
iconutil -c icns "$ICONSET" -o "$ASSETS/AppIcon.icns"
log "→ assets/AppIcon.icns"

# ---- Android ----
log "生成安卓图标…"
declare -a DENSITIES=("mdpi:48:108" "hdpi:72:162" "xhdpi:96:216" "xxhdpi:144:324" "xxxhdpi:192:432")
for entry in "${DENSITIES[@]}"; do
  IFS=':' read -r density icon fg <<< "$entry"
  dir="$RES/mipmap-$density"
  mkdir -p "$dir"
  resize "$BUILD/icon-1024.png" "$icon" "$dir/ic_launcher.png"
  resize "$BUILD/icon-round-1024.png" "$icon" "$dir/ic_launcher_round.png"
  resize "$BUILD/icon-fg-1024.png" "$fg" "$dir/ic_launcher_foreground.png"
done

# 自适应图标的背景色跟 App 底色一致
cat > "$RES/values/ic_launcher_background.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B0B0D</color>
</resources>
EOF

log "完成"
