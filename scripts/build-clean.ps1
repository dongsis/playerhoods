$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:NEXT_DIST_DIR = '.next'

$distDirs = @('.next', '.next-dev', '.next-build')
foreach ($dir in $distDirs) {
  if (Test-Path $dir) {
    Remove-Item $dir -Recurse -Force
  }
}

New-Item -ItemType Directory -Force -Path '.next\server' | Out-Null

npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Build failed with exit code $LASTEXITCODE"
}
