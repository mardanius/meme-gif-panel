#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
CERTS="$ROOT/certs"
TOOLS="$ROOT/tools"
STAGE="$DIST/stage"
ZXP="$DIST/MemeGifLibrary.zxp"
CERT="$CERTS/memegif.p12"
CERT_PASS="${ZXP_CERT_PASSWORD:-memegif-dev}"
ZXPSIGN="${ZXPSIGNCMD:-}"

mkdir -p "$DIST" "$CERTS" "$TOOLS"

find_zxpsign() {
  if [[ -n "$ZXPSIGN" && -x "$ZXPSIGN" ]]; then
    echo "$ZXPSIGN"
    return
  fi
  if command -v ZXPSignCmd >/dev/null 2>&1; then
    command -v ZXPSignCmd
    return
  fi
  if [[ -x "$TOOLS/ZXPSignCmd" ]]; then
    echo "$TOOLS/ZXPSignCmd"
    return
  fi
  return 1
}

download_zxpsign_macos() {
  local bin_url="https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.3/macOS/ZXPSignCmd"
  echo "Descargando ZXPSignCmd…"
  curl -fL "$bin_url" -o "$TOOLS/ZXPSignCmd" || return 1
  chmod +x "$TOOLS/ZXPSignCmd"
  if [[ ! -s "$TOOLS/ZXPSignCmd" ]]; then
    return 1
  fi
}

SIGN="$(find_zxpsign || true)"
if [[ -z "$SIGN" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    download_zxpsign_macos || true
    SIGN="$(find_zxpsign || true)"
  fi
fi

if [[ -z "$SIGN" ]]; then
  cat <<EOF
No se encontró ZXPSignCmd.

Descárgalo desde:
  https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD

Colócalo en:
  $TOOLS/ZXPSignCmd
o exporta ZXPSIGNCMD=/ruta/a/ZXPSignCmd

Luego vuelve a ejecutar: bash scripts/package-zxp.sh
EOF
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$ROOT/CSXS" "$ROOT/css" "$ROOT/js" "$ROOT/jsx" "$ROOT/index.html" "$STAGE/"
bash "$ROOT/scripts/inject-key.sh" "$STAGE"

if [[ ! -f "$CERT" ]]; then
  echo "Creando certificado self-signed de desarrollo…"
  "$SIGN" -selfSignedCert ES Madrid MemeGif "Meme GIF Library" "$CERT_PASS" "$CERT"
fi

rm -f "$ZXP"
if ! "$SIGN" -sign "$STAGE" "$ZXP" "$CERT" "$CERT_PASS" -tsa http://timestamp.digicert.com; then
  echo "Timestamp no disponible; firmando sin TSA…"
  "$SIGN" -sign "$STAGE" "$ZXP" "$CERT" "$CERT_PASS"
fi

rm -rf "$STAGE"
echo "ZXP creado: $ZXP"
