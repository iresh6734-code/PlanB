#!/usr/bin/env bash
# Actualiza SOLO la interfaz (carpeta dist) del CRM 4331 con la última compilación aislada.
# No toca datos ni reinicia el servidor: los archivos estáticos se sirven desde disco. Guarda antes una copia de la interfaz actual.
#   bash tools/actualizar-interfaz-4331.sh
# Para volver atrás: sustituir runtime/dist por la carpeta dist de la copia que este script anuncia.
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD=tests/.tmp/rd/dist
RT=planb-local-crm-completo-2026-10-29/runtime
[ -f "$BUILD/index.html" ] || { echo "No hay compilación en $BUILD. Ejecuta antes: npx vite build --outDir $BUILD --emptyOutDir"; exit 1; }
BK="$RT/backup-dist-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK" && cp -r "$RT/dist" "$BK/dist" && diff -rq "$RT/dist" "$BK/dist" >/dev/null
echo "Copia de la interfaz actual: $BK"
rm -rf "$RT/dist.new" && cp -r "$BUILD" "$RT/dist.new"
mv "$RT/dist" "$RT/dist.old" && mv "$RT/dist.new" "$RT/dist"
diff -rq "$RT/dist" "$BUILD" >/dev/null && rm -rf "$RT/dist.old"
echo "Interfaz actualizada. Recarga http://localhost:4331/ con Ctrl+F5."
