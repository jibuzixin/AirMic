#!/usr/bin/env bash
# 生成一个项目内使用的代码签名证书
#
#   ./scripts/setup-signing.sh
#
# 为什么需要：
#   打包时如果用 ad-hoc 签名（codesign -s -），每次重新编译都会生成新的
#   cdhash。macOS 的「辅助功能」授权是按签名绑定程序的 —— 一重打包授权就
#   失效（列表里的开关还开着，但 AXIsProcessTrusted() 已经是 false）。
#
#   用一个固定的自签名证书签名后，签名身份（证书）不变，授权就能留得住。
#
# 全部产物都在项目内：.toolchain/signing/ ，不碰登录钥匙串。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/.toolchain/signing"
KC="$DIR/airmic.keychain-db"
CERT_CN="AirMic Dev"
KC_PASS="airmic"

log() { printf '\033[1;34m[signing]\033[0m %s\n' "$*"; }

# 已经有可用的签名身份就直接跳过
if security show-keychain-info "$KC" >/dev/null 2>&1 \
   && security find-identity -p codesigning "$KC" 2>/dev/null | grep -q "$CERT_CN"; then
  log "签名身份已存在：$CERT_CN"
  exit 0
fi

mkdir -p "$DIR"
cd "$DIR"

log "生成自签名证书（$CERT_CN）…"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout key.pem -out cert.pem \
  -subj "/CN=$CERT_CN" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" >/dev/null 2>&1

# ⚠️ 必须用老式 PKCS#12 加密：OpenSSL 3 默认的 AES/SHA256 组合
# macOS 的 `security import` 不认（会报 MAC verification failed）
openssl pkcs12 -export \
  -inkey key.pem -in cert.pem \
  -out identity.p12 -name "$CERT_CN" \
  -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 \
  -passout "pass:$KC_PASS" >/dev/null 2>&1

log "导入项目内钥匙串…"
security create-keychain -p "$KC_PASS" "$KC" 2>/dev/null || true
security set-keychain-settings "$KC"
security unlock-keychain -p "$KC_PASS" "$KC"
security import identity.p12 -k "$KC" -P "$KC_PASS" -A -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PASS" "$KC" >/dev/null 2>&1

# 私钥留在钥匙串里就够了，落盘的删掉
drop_file() { [ -f "$1" ] && find "$1" -maxdepth 0 -type f -delete; }
drop_file key.pem
drop_file identity.p12
# cert.pem 留着（排查签名问题时要看）

log "完成。之后 package-mac.sh 会自动用它签名。"
log "注意：换签名身份后需要在「辅助功能」里重新授权一次，之后重打包不用再授权。"
