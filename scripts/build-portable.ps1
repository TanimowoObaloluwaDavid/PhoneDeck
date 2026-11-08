# Builds a self-contained Windows folder + zip in dist/.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1
param([string]$Version = '1.0.0')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'dist'
$app = Join-Path $out 'PhoneDeck'

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app | Out-Null

# Electron runtime, renamed to the app executable.
Copy-Item (Join-Path $root 'node_modules\electron\dist\*') $app -Recurse -Force
Rename-Item (Join-Path $app 'electron.exe') 'PhoneDeck.exe'
Remove-Item (Join-Path $app 'resources\default_app.asar') -Force -ErrorAction SilentlyContinue

$appDir = Join-Path $app 'resources\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

Copy-Item (Join-Path $root 'package.json') $appDir
Copy-Item (Join-Path $root 'README.md') $appDir
Copy-Item (Join-Path $root 'LICENSE') $appDir
Copy-Item (Join-Path $root 'shell') $appDir -Recurse
Copy-Item (Join-Path $root 'engine') $appDir -Recurse

$appResources = Join-Path $appDir 'resources'
New-Item -ItemType Directory -Force -Path $appResources | Out-Null
Copy-Item (Join-Path $root 'resources\bin') $appResources -Recurse
Copy-Item (Join-Path $root 'resources\icon.ico') $appResources
Copy-Item (Join-Path $root 'resources\icon.png') $appResources

# Production dependencies only (no Electron, no tooling).
$packages = & npm ls --omit=dev --all --parseable
foreach ($package in ($packages | Where-Object { $_ -like '*node_modules*' })) {
  $relative = $package.Substring($root.Length + 1)
  $destination = Join-Path $appDir $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
  Copy-Item $package $destination -Recurse -Force
}

$zip = Join-Path $out "PhoneDeck-$Version-win-x64.zip"
Compress-Archive -Path $app -DestinationPath $zip -CompressionLevel Optimal
Write-Host "portable build: $zip"
