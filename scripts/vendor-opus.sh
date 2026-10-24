#!/usr/bin/env bash
# 把 libopus 源码 vendored 进工程
#
#   ./scripts/vendor-opus.sh
#
# 为什么需要它：macOS 的 AudioConverter **不支持 Opus 解码**
# （AudioFormatGetProperty('opus') 返回 -50），所以解码必须自己带。
# libopus 是 BSD-3 许可，可以直接打包进 App。
#
# 产物：mac/Sources/COpus/  （SwiftPM 的 C target）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/mac/Sources/COpus"
OPUS_VERSION="1.5.2"
TARBALL_URL="https://downloads.xiph.org/releases/opus/opus-${OPUS_VERSION}.tar.gz"

if [ -f "$DEST/include/opus.h" ]; then
  echo "[vendor] libopus 已在 $DEST，跳过"
  exit 0
fi

log() { printf '\033[1;34m[vendor]\033[0m %s\n' "$*"; }

work="$(mktemp -d "$ROOT/.toolchain/opus-work.XXXXXX")"
log "下载 libopus ${OPUS_VERSION}…"
curl -fL --http1.1 --retry 5 --retry-delay 2 --retry-all-errors --progress-bar \
  "$TARBALL_URL" -o "$work/opus.tar.gz"
tar -xzf "$work/opus.tar.gz" -C "$work"
src="$work/opus-${OPUS_VERSION}"

mkdir -p "$DEST/include" "$DEST/src"
cp "$src/include/opus.h" "$src/include/opus_defines.h" "$src/include/opus_types.h" \
   "$src/include/opus_multistream.h" "$DEST/include/"

# 只拷编译需要的部分：celt / silk / opus 三个目录 + 顶层源文件
for dir in celt silk opus; do
  mkdir -p "$DEST/src/$dir"
  find "$src/$dir" -maxdepth 1 \( -name '*.c' -o -name '*.h' -o -name '*.S' \) -exec cp {} "$DEST/src/$dir/" \;
done
find "$src" -maxdepth 1 \( -name '*.c' -o -name '*.h' \) -exec cp {} "$DEST/src/" \;

# 第三方小工具
for dir in third_party/silk third_party/smallft third_party/fixed_generic; do
  if [ -d "$src/$dir" ]; then
    target="$DEST/src/$(basename $dir)"
    mkdir -p "$target"
    find "$src/$dir" -maxdepth 1 \( -name '*.c' -o -name '*.h' \) -exec cp {} "$target/" \;
  fi
done

log "libopus → $DEST"
