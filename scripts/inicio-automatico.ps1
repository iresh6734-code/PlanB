param([switch]$Quitar)
$ErrorActionPreference = 'Stop'
$taskFolder = $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskFolder 'server.mjs'))) { throw 'Ejecuta este archivo desde la carpeta extraída del paquete principal de Plan B.' }
$taskBytes = [Text.Encoding]::UTF8.GetBytes($taskFolder.ToLowerInvariant())
$taskHasher = [Security.Cryptography.SHA256]::Create()
try { $taskHash = ([BitConverter]::ToString($taskHasher.ComputeHash($taskBytes))).Replace('-','').Substring(0,12) }
finally { $taskHasher.Dispose() }
$taskName = 'PlanB-' + $taskHash
if ($Quitar) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Inicio automático de esta instalación eliminado.'
    exit
}
$taskRunner = Join-Path $taskFolder 'INICIAR EN SEGUNDO PLANO.ps1'
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $taskRunner + '"') -WorkingDirectory $taskFolder
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$taskSettings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'Plan B local: capturas mientras tu sesión de Windows esté abierta.' -Force | Out-Null
Write-Host 'Inicio automático preparado para el próximo inicio de sesión. Habilita las capturas en la aplicación.'
Write-Host 'Para quitarlo, ejecuta este mismo archivo con -Quitar antes de mover o borrar la carpeta.'
