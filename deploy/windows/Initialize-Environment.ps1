[CmdletBinding()]
param([string]$EnvDirectory = "$env:ProgramData\JudyTik")
$ErrorActionPreference = 'Stop'
$admin = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator.' }
if (Test-Path -LiteralPath $EnvDirectory) { throw 'Environment directory already exists. Preserve it; use an absent dedicated directory for first setup.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $EnvDirectory | Out-Null
& icacls.exe $EnvDirectory /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)(F)' '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-19:(RX)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect environment directory.' }
& $node (Join-Path $PSScriptRoot '..\init-env.mjs') $EnvDirectory
if ($LASTEXITCODE -ne 0) { throw 'Environment generation failed.' }
foreach ($name in @('runtime.env','migrate.env','.pg-bootstrap.sql')) {
    & icacls.exe (Join-Path $EnvDirectory $name) /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect environment file.' }
}
& icacls.exe (Join-Path $EnvDirectory 'runtime.env') /grant '*S-1-5-19:(R)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant service access to runtime configuration.' }
$logs = Join-Path $EnvDirectory 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
& icacls.exe $logs /grant '*S-1-5-19:(OI)(CI)(M)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant log directory access.' }
Write-Host 'Environment prepared. Runtime is readable by LocalService; migration credentials remain Administrator/SYSTEM only.'
