$ErrorActionPreference = 'Stop'
$initializer = Join-Path $PSScriptRoot '..\windows\Initialize-Environment.ps1'
$base = Join-Path $env:TEMP ('judytik-acl-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base | Out-Null
try {
    $existing = Join-Path $base 'precreated'
    New-Item -ItemType Directory -Path $existing | Out-Null
    $before = (Get-Acl -LiteralPath $existing).Sddl
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $initializer -EnvDirectory $existing 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { throw 'Preexisting directories must be rejected.' }
    if ((Get-Acl -LiteralPath $existing).Sddl -ne $before) { throw 'Rejected directory ACL was changed.' }
    if (@(Get-ChildItem -Force -LiteralPath $existing).Count -ne 0) { throw 'Secrets were written into a preexisting directory.' }
    $fresh = Join-Path $base 'fresh'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $initializer -EnvDirectory $fresh
    if ($LASTEXITCODE -ne 0) { throw 'Fresh environment initialization failed.' }
    foreach ($name in @('migrate.env','.pg-bootstrap.sql')) {
        foreach ($rule in (Get-Acl -LiteralPath (Join-Path $fresh $name)).Access) {
            $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($sid -notin @('S-1-5-18','S-1-5-32-544')) { throw "Unexpected migration credential access: $sid" }
        }
    }
    $runtimeReaders = @((Get-Acl -LiteralPath (Join-Path $fresh 'runtime.env')).Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
    if ('S-1-5-19' -notin $runtimeReaders) { throw 'LocalService cannot read runtime.env.' }
    Write-Host 'Windows ACL regression passed: precreated directory rejected unchanged; runtime and migration access separated.'
} finally { Remove-Item -LiteralPath $base -Recurse -Force }
