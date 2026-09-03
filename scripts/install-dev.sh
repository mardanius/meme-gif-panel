#!/usr/bin/env bash
set -euo pipefail

# Copia el panel de este proyecto sobre la carpeta que Premiere carga,
# para probar cambios sin reinstalar el .zxp.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEM_DIR="/Library/Application Support/Adobe/CEP/extensions/Meme GIF Library"
USER_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.memegif.library"
DEST="${MEMEGIF_DEST:-}"

if [[ -z "$DEST" ]]; then
  if [[ -d "$SYSTEM_DIR" ]]; then
    DEST="$SYSTEM_DIR"
  else
    DEST="$USER_DIR"
  fi
fi

if [[ ! -d "$DEST" ]]; then
  echo "Creando $DEST"
  mkdir -p "$DEST"
fi

if [[ ! -w "$DEST" ]]; then
  echo "Sin permiso de escritura en:"
  echo "  $DEST"
  echo "Ejecuta con sudo o define MEMEGIF_DEST con otra ruta."
  exit 1
fi

# PlayerDebugMode permite cargar el panel con la firma alterada por esta copia.
for n in 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$n" PlayerDebugMode 1 2>/dev/null || true
done

for item in CSXS css js jsx index.html; do
  rm -rf "$DEST/$item"
  cp -R "$ROOT/$item" "$DEST/$item"
done

bash "$ROOT/scripts/inject-key.sh" "$DEST"

VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$DEST/CSXS/manifest.xml" | head -n 1)"

echo "Panel v$VERSION copiado en:"
echo "  $DEST"
echo
echo "En Premiere: pulsa Recargar en el panel, o cierra y abre Premiere la primera vez."
