#!/usr/bin/env bash
set -euo pipefail

# Sustituye el marcador __GIPHY_API_KEY__ de js/app.js por la key de .giphy-key.
# La key vive solo en local y en los paquetes generados, nunca en el repo.
# Uso: bash scripts/inject-key.sh <carpeta_con_el_panel>

TARGET_DIR="${1:?Falta la carpeta destino}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_FILE="$ROOT/.giphy-key"
APP="$TARGET_DIR/js/app.js"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Sin .giphy-key: el panel pedirá su propia API key a cada usuario."
  exit 0
fi

KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
if [[ ! "$KEY" =~ ^[A-Za-z0-9]{20,}$ ]]; then
  echo "La key de .giphy-key no tiene el formato esperado; no se incluye."
  exit 1
fi

KEY="$KEY" APP="$APP" python3 <<'EOF'
import os, pathlib
app = pathlib.Path(os.environ["APP"])
source = app.read_text()
if "__GIPHY_API_KEY__" not in source:
    raise SystemExit("No encontré el marcador __GIPHY_API_KEY__ en " + str(app))
app.write_text(source.replace("__GIPHY_API_KEY__", os.environ["KEY"]))
EOF

echo "API key incluida en el paquete."
