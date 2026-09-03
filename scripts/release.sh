#!/usr/bin/env bash
set -euo pipefail

# Publica la versión del manifiesto como release de GitHub, con el .zxp adjunto.
# Uso: bash scripts/release.sh ["notas de la versión"]

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' CSXS/manifest.xml | head -n 1)"
if [[ -z "$VERSION" ]]; then
  echo "No pude leer la versión de CSXS/manifest.xml"
  exit 1
fi
TAG="v$VERSION"
NOTES="${1:-Instala el .zxp adjunto y reinicia Premiere.}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Falta gh. Instálalo con: brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh no está autenticado. Ejecuta: gh auth login"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Tienes cambios sin confirmar. Haz commit antes de publicar $TAG."
  git status --short
  exit 1
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "La release $TAG ya existe. Sube la versión en CSXS/manifest.xml antes de publicar."
  exit 1
fi

bash scripts/package-zxp.sh

git push origin HEAD

gh release create "$TAG" "dist/MemeGifLibrary.zxp" \
  --title "$TAG" \
  --notes "$NOTES"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo
echo "Release $TAG publicada."
echo "URL de actualizaciones para el panel:"
echo "  https://api.github.com/repos/$REPO/releases/latest"
