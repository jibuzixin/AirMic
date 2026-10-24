#!/usr/bin/env bash
# AirMic 工具链安装脚本 —— 全部装进项目内 .toolchain/，不动系统环境
#
#   ./scripts/setup-env.sh
#
# 安装内容：
#   1. JDK 17（Temurin）        → .toolchain/jdk
#   2. Android command-line SDK → .toolchain/android-sdk
#   3. Android platform 35 / build-tools 35 / platform-tools
#
# 不做：brew install、npm install -g、修改 ~/.zshrc、覆盖系统 Java 或 Android SDK
# 不做：递归删除任何路径（脚本只创建目录，重复执行靠「已存在则跳过」保证幂等）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN="$ROOT/.toolchain"
mkdir -p "$TOOLCHAIN"

log() { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; exit 1; }

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) JDK_ARCH="aarch64" ;;
  x86_64) JDK_ARCH="x64" ;;
  *) die "不支持的架构：$ARCH" ;;
esac

# 只删一个明确命名的临时文件（不是目录递归删除）
drop_file() {
  [ -f "$1" ] && find "$1" -maxdepth 0 -type f -delete
}

# ---------------------------------------------------------------- JDK 17
install_jdk() {
  # ⚠️ 用 JDK 21：Capacitor 7 的 android 模块要求 source/target 21，
  # 用 17 会报「无效的源发行版：21」
  local home="$TOOLCHAIN/jdk21"
  if [ -x "$home/Contents/Home/bin/java" ]; then
    log "JDK 21 已存在，跳过"
    return
  fi
  log "下载 JDK 21（Temurin, $JDK_ARCH）…"
  local work tarball
  work="$(mktemp -d "$TOOLCHAIN/jdk-work.XXXXXX")"
  tarball="$work/jdk21.tar.gz"
  curl -fL --http1.1 --retry 5 --retry-delay 2 --retry-all-errors --progress-bar \
    "https://api.adoptium.net/v3/binary/latest/21/ga/mac/${JDK_ARCH}/jdk/hotspot/normal/eclipse" \
    -o "$tarball"
  tar -xzf "$tarball" -C "$work"
  drop_file "$tarball"
  # 解出来是 jdk-17.x.y+z 一层目录，取其中唯一一层
  local inner
  inner="$(find "$work" -maxdepth 1 -mindepth 1 -type d | head -1)"
  [ -n "$inner" ] || die "JDK 解压失败"
  mv "$inner" "$home"
  rmdir "$work" 2>/dev/null || true
  log "JDK 21 → $home"
}

# ---------------------------------------------------------- Android SDK
install_android_sdk() {
  local sdk="$TOOLCHAIN/android-sdk"
  if [ -x "$sdk/cmdline-tools/latest/bin/sdkmanager" ]; then
    log "Android SDK 已存在，跳过"
    return
  fi
  log "下载 Android command-line tools…"
  local work zip
  work="$(mktemp -d "$TOOLCHAIN/sdk-work.XXXXXX")"
  zip="$work/cmdline-tools.zip"
  curl -fL --http1.1 --retry 5 --retry-delay 2 --retry-all-errors --progress-bar \
    "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip" \
    -o "$zip"
  mkdir -p "$sdk/cmdline-tools"
  unzip -q "$zip" -d "$work/extracted"
  drop_file "$zip"
  mv "$work/extracted/cmdline-tools" "$sdk/cmdline-tools/latest"

  export JAVA_HOME="$TOOLCHAIN/jdk21/Contents/Home"
  export ANDROID_HOME="$sdk"
  export ANDROID_SDK_ROOT="$sdk"
  export PATH="$JAVA_HOME/bin:$PATH"

  log "接受 Android SDK 许可协议…"
  yes | "$sdk/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$sdk" --licenses >/dev/null 2>&1 || true

  log "安装 platform-tools / platform 35 / build-tools 35…"
  "$sdk/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$sdk" \
    "platform-tools" "platforms;android-35" "build-tools;35.0.0"
  log "Android SDK → $sdk"
}

install_jdk
install_android_sdk

mkdir -p "$TOOLCHAIN/gradle-home" "$TOOLCHAIN/npm-cache"

cat > "$TOOLCHAIN/env.sh" <<EOF
# 由 scripts/setup-env.sh 生成，请用 scripts/env.sh 进入环境
export AIRMIC_ROOT="$ROOT"
export AIRMIC_TOOLCHAIN="$TOOLCHAIN"
export JAVA_HOME="$TOOLCHAIN/jdk21/Contents/Home"
export ANDROID_HOME="$TOOLCHAIN/android-sdk"
export ANDROID_SDK_ROOT="$TOOLCHAIN/android-sdk"
export GRADLE_USER_HOME="$TOOLCHAIN/gradle-home"
export npm_config_cache="$TOOLCHAIN/npm-cache"
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH"
EOF

cat > "$ROOT/.gitignore" <<'EOF'
.toolchain/
node_modules/
dist/
build/
.gradle/
*.xcodeproj/
*.xcworkspace/
.DS_Store
EOF

log "完成。进环境： source scripts/env.sh"
