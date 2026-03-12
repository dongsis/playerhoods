# ai-handoff.ps1
# Generates technical_snapshot.md for AI collaboration handoff.
# Run from project root: .\scripts\ai-handoff.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$ErrorActionPreference = "SilentlyContinue"
$branch = git branch --show-current 2>$null
$status = git status --short 2>$null
$changed = git diff --name-only 2>$null
$diffStat = git diff --stat 2>$null
$recent = git log -n 5 --oneline 2>$null
$ErrorActionPreference = "Stop"

$cbOpen = '```text'
$cbClose = '```'
$out = @"
# Technical Snapshot

## Timestamp
$timestamp

## Git Branch
$branch

## Git Status
$cbOpen
$status
$cbClose

### Changed Files
$($changed -join "`n")

### Diff Stat
$cbOpen
$diffStat
$cbClose

### Recent Commits
$($recent -join "`n")

## Test Output
[run tests and paste here]

## Migration State
[list relevant migrations or schema notes]
"@

$outPath = Join-Path $projectRoot "ai\outbox\technical_snapshot.md"
$out | Set-Content -Path $outPath -Encoding UTF8
Write-Host "Written: $outPath"
