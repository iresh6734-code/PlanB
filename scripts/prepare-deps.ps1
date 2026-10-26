$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $taskRoot 'runtime-assets'
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRoot 'package.json') -Destination $assetRoot -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'package-lock.json') -Destination $assetRoot -Force
Push-Location -LiteralPath $assetRoot
try { npm ci --omit=dev --ignore-scripts --no-audit --no-fund --cache (Join-Path $taskRoot '.npm-cache'); if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar las dependencias.' } }
finally { Pop-Location }
