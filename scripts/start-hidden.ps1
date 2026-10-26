$ErrorActionPreference = 'Stop'
$taskNode = Join-Path $PSScriptRoot 'node.exe'
$taskEntry = Join-Path $PSScriptRoot 'server.mjs'
Start-Process -FilePath $taskNode -ArgumentList ('"' + $taskEntry + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
