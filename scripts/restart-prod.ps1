$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Stop-ProcessOnPort {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $owningProcessId = $connection.OwningProcess
    if (-not $owningProcessId) {
      continue
    }

    try {
      Stop-Process -Id $owningProcessId -Force -ErrorAction Stop
    } catch {
      Write-Warning "Could not stop process $owningProcessId on port ${Port}: $($_.Exception.Message)"
    }
  }
}

Stop-ProcessOnPort -Port 3000
Start-Sleep -Seconds 1

& "$PSScriptRoot\\build-clean.ps1"

$stdout = Join-Path $root '.next-start.out'
$stderr = Join-Path $root '.next-start.err'
if (Test-Path $stdout) { Remove-Item $stdout -Force }
if (Test-Path $stderr) { Remove-Item $stderr -Force }

Start-Process -FilePath cmd.exe `
  -ArgumentList '/c', 'set NODE_ENV=production&& set NEXT_DIST_DIR=.next&& npm run start > .next-start.out 2> .next-start.err' `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Start-Sleep -Seconds 3
Write-Output 'Production server restarted on http://localhost:3000'
