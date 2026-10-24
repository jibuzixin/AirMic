# AirMic 项目隔离环境
#
# 用法： source scripts/env.sh
#
# 所有工具链都装在项目内的 .toolchain/ 目录：
#   .toolchain/jdk21/         JDK 21（Temurin，安卓构建需要 21）
#   .toolchain/android-sdk/   Android SDK（platform-tools / platforms / build-tools）
#   .toolchain/gradle-home/   Gradle 缓存
#   .toolchain/node/          （可选）Node 副本
#
# 不会改动：~/.zshrc、/usr/local、Homebrew、系统 Java、系统 Android SDK
# 不会执行任何 npm install -g

# shellcheck shell=bash

_AIRMIC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%N}}")/.." && pwd)"

export AIRMIC_ROOT="$_AIRMIC_ROOT"
export AIRMIC_TOOLCHAIN="$_AIRMIC_ROOT/.toolchain"

# --- JDK 21（安卓构建要求 21；用 17 会报「无效的源发行版」） ---
if [ -d "$AIRMIC_TOOLCHAIN/jdk21/Contents/Home" ]; then
  export JAVA_HOME="$AIRMIC_TOOLCHAIN/jdk21/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# --- Android SDK ---
if [ -d "$AIRMIC_TOOLCHAIN/android-sdk" ]; then
  export ANDROID_HOME="$AIRMIC_TOOLCHAIN/android-sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
fi

# --- Gradle 缓存也留在项目内 ---
if [ -d "$AIRMIC_TOOLCHAIN/gradle-home" ]; then
  export GRADLE_USER_HOME="$AIRMIC_TOOLCHAIN/gradle-home"
fi

# --- Swift / Xcode（只用系统已有的，不做任何安装） ---
export SDKROOT="$(xcrun --show-sdk-path 2>/dev/null || true)"

# --- Node 依赖安装位置（避免污染全局） ---
export npm_config_cache="$AIRMIC_TOOLCHAIN/npm-cache"

echo "[airmic] JAVA_HOME=${JAVA_HOME:-<未安装>}"
echo "[airmic] ANDROID_HOME=${ANDROID_HOME:-<未安装>}"
