$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:NODE_ENV = 'production'
$env:NEXT_DIST_DIR = '.next'

npm.cmd run start
if ($LASTEXITCODE -ne 0) {
  throw "Start failed with exit code $LASTEXITCODE"
}
