[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$version = '2.12.0'
$expected = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da'
$destination = Join-Path $PSScriptRoot 'JudyTikService.exe'
if (Test-Path $destination) {
    if ((Get-FileHash $destination -Algorithm SHA256).Hash -ne $expected) { throw 'Existing WinSW binary does not match the pinned version; review before replacing it.' }
    Write-Host 'Pinned WinSW binary already present.'
    exit 0
}
$temp = "$destination.tmp"
if (Test-Path $temp) { throw 'Temporary download already exists; review and remove it before retrying.' }
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/winsw/winsw/releases/download/v$version/WinSW-x64.exe" -OutFile $temp
    if ((Get-FileHash $temp -Algorithm SHA256).Hash -ne $expected) { throw 'WinSW SHA-256 mismatch; binary was not installed.' }
    Move-Item -LiteralPath $temp -Destination $destination
    Write-Host 'Pinned WinSW x64 downloaded and SHA-256 verified. Service has not been installed yet.'
} finally {
    if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Force }
}
