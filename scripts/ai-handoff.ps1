# scripts/ai-handoff.ps1
# Generate ai/outbox/technical_snapshot.md for ChatGPT <-> Cursor handoff.
# Usage:
#   .\scripts\ai-handoff.ps1
#
# Notes:
# - Does NOT require git add
# - Uses `git diff HEAD` so both staged and unstaged changes are included
# - Safe for local-only collaboration artifacts if they are .gitignored

$ErrorActionPreference = "Stop"

function Safe-Run {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )
    try {
        return (Invoke-Expression $Command 2>&1 | Out-String).Trim()
    } catch {
        return "[command failed] $Command`n$($_.Exception.Message)"
    }
}

function Section-CodeBlock {
    param(
        [string]$Content
    )
    if ([string]::IsNullOrWhiteSpace($Content)) {
        return "```text`n[none]`n```"
    }
    return "```text`n$Content`n```"
}

function Get-ProjectRoot {
    if ($PSScriptRoot) {
        return (Split-Path -Parent $PSScriptRoot)
    }
    return (Get-Location).Path
}

function Get-FileList {
    param(
        [string]$RelativePath,
        [string]$Filter = "*",
        [int]$MaxItems = 200
    )

    $fullPath = Join-Path $projectRoot $RelativePath
    if (!(Test-Path $fullPath)) {
        return "[path not found] $RelativePath"
    }

    $items = Get-ChildItem -Path $fullPath -Recurse -File -Filter $Filter -ErrorAction SilentlyContinue |
        Sort-Object FullName |
        Select-Object -First $MaxItems |
        ForEach-Object {
            $_.FullName.Replace($projectRoot + "\", "").Replace("\", "/")
        }

    if (!$items -or $items.Count -eq 0) {
        return "[none]"
    }

    return ($items -join "`n")
}

function Get-LatestFiles {
    param(
        [string]$RelativePath,
        [int]$MaxItems = 20
    )

    $fullPath = Join-Path $projectRoot $RelativePath
    if (!(Test-Path $fullPath)) {
        return "[path not found] $RelativePath"
    }

    $items = Get-ChildItem -Path $fullPath -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $MaxItems |
        ForEach-Object {
            $rel = $_.FullName.Replace($projectRoot + "\", "").Replace("\", "/")
            "$($rel)    |    $($_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))"
        }

    if (!$items -or $items.Count -eq 0) {
        return "[none]"
    }

    return ($items -join "`n")
}

function Try-ReadFile {
    param(
        [string]$RelativePath,
        [int]$MaxLines = 120
    )

    $fullPath = Join-Path $projectRoot $RelativePath
    if (!(Test-Path $fullPath)) {
        return "[file not found] $RelativePath"
    }

    try {
        $lines = Get-Content -Path $fullPath -ErrorAction Stop
        if ($lines.Count -gt $MaxLines) {
            $lines = $lines | Select-Object -First $MaxLines
            return (($lines -join "`n") + "`n...[truncated]")
        }
        return ($lines -join "`n")
    } catch {
        return "[failed to read] $RelativePath`n$($_.Exception.Message)"
    }
}

function Try-ReadLatestTimestampedFile {
    param(
        [string]$RelativeDirectory,
        [string]$Prefix,
        [int]$MaxLines = 120
    )

    $dirPath = Join-Path $projectRoot $RelativeDirectory
    if (!(Test-Path $dirPath)) {
        return "[path not found] $RelativeDirectory"
    }

    $files = Get-ChildItem -Path $dirPath -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match ('^' + [regex]::Escape($Prefix) + '_(\d{8})\.md$')
        } |
        Sort-Object {
            if ($_.Name -match ('^' + [regex]::Escape($Prefix) + '_(\d{8})\.md$')) {
                $matches[1]
            } else {
                ''
            }
        } -Descending

    if (!$files -or $files.Count -eq 0) {
        return "[file not found] $RelativeDirectory/$Prefix`_mmddhhmm.md"
    }

    $latest = $files | Select-Object -First 1
    $relPath = $latest.FullName.Replace($projectRoot + "\", "").Replace("\", "/")
    return Try-ReadFile -RelativePath $relPath -MaxLines $MaxLines
}

$projectRoot = Get-ProjectRoot
Set-Location $projectRoot

$outDir = Join-Path $projectRoot "ai\outbox"
if (!(Test-Path $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$outPath = Join-Path $outDir "technical_snapshot.md"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# -----------------------------
# Git snapshot
# -----------------------------
$gitAvailable = $true
try {
    $null = git rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -ne 0) {
        $gitAvailable = $false
    }
} catch {
    $gitAvailable = $false
}

if ($gitAvailable) {
    $branch            = Safe-Run 'git branch --show-current'
    $statusShort       = Safe-Run 'git status --short'
    $statusFull        = Safe-Run 'git status'
    $changedFilesAll   = Safe-Run 'git diff HEAD --name-only'
    $diffStatAll       = Safe-Run 'git diff HEAD --stat'
    $diffSummaryAll    = Safe-Run 'git diff HEAD --summary'
    $unstagedFiles     = Safe-Run 'git diff --name-only'
    $stagedFiles       = Safe-Run 'git diff --cached --name-only'
    $recentCommits     = Safe-Run 'git log -n 8 --oneline'
    $currentHead       = Safe-Run 'git rev-parse --short HEAD'
} else {
    $branch = "[git not available]"
    $statusShort = "[git not available]"
    $statusFull = "[git not available]"
    $changedFilesAll = "[git not available]"
    $diffStatAll = "[git not available]"
    $diffSummaryAll = "[git not available]"
    $unstagedFiles = "[git not available]"
    $stagedFiles = "[git not available]"
    $recentCommits = "[git not available]"
    $currentHead = "[git not available]"
}

# -----------------------------
# Project structure snapshot
# -----------------------------
$migrationFiles = Get-FileList -RelativePath "supabase/migrations" -Filter "*.sql" -MaxItems 300
$latestMigrations = Get-LatestFiles -RelativePath "supabase/migrations" -MaxItems 30

$sqlFilesLatest = Get-LatestFiles -RelativePath "supabase" -MaxItems 30
$srcFilesLatest = Get-LatestFiles -RelativePath "src" -MaxItems 40
$testFilesLatest = Get-LatestFiles -RelativePath "tests" -MaxItems 30
$docsFilesLatest = Get-LatestFiles -RelativePath "docs" -MaxItems 30

# -----------------------------
# Optional AI files
# -----------------------------
$taskForCursor = Try-ReadLatestTimestampedFile -RelativeDirectory "ai/inbox" -Prefix "task_for_curser" -MaxLines 120
$cursorReport = Try-ReadLatestTimestampedFile -RelativeDirectory "ai/outbox" -Prefix "cursor_report" -MaxLines 120
$projectState = Try-ReadFile -RelativePath "ai/state/project_state.md" -MaxLines 120

# -----------------------------
# Environment / tooling snapshot
# -----------------------------
$nodeVersion = Safe-Run 'node -v'
$npmVersion = Safe-Run 'npm -v'
$npxVersion = Safe-Run 'npx -v'
$supabaseVersion = Safe-Run 'supabase --version'

# -----------------------------
# Optional test commands
# Adjust to your project if needed
# -----------------------------
$testResults = @()

$packageJsonPath = Join-Path $projectRoot "package.json"
if (Test-Path $packageJsonPath) {
    $pkgRaw = ""
    try {
        $pkgRaw = Get-Content $packageJsonPath -Raw -ErrorAction Stop
        if ($pkgRaw -match '"test"\s*:') {
            $testResults += "### npm test"
            $testResults += (Section-CodeBlock (Safe-Run 'npm test'))
        } else {
            $testResults += "### npm test"
            $testResults += (Section-CodeBlock "[package.json exists, but no test script detected]")
        }
    } catch {
        $testResults += "### npm test"
        $testResults += (Section-CodeBlock "[failed to inspect package.json]")
    }
} else {
    $testResults += "### npm test"
    $testResults += (Section-CodeBlock "[package.json not found]")
}

# Optional lightweight checks
$testResults += "### TypeScript check"
$tsconfigPath = Join-Path $projectRoot "tsconfig.json"
if (Test-Path $tsconfigPath) {
    $testResults += (Section-CodeBlock (Safe-Run 'npx tsc --noEmit'))
} else {
    $testResults += (Section-CodeBlock "[tsconfig.json not found]"))
}

# -----------------------------
# Migration / schema notes
# -----------------------------
$migrationNotes = @()
$migrationNotes += "### Latest migration files"
$migrationNotes += (Section-CodeBlock $latestMigrations)

$migrationNotes += "### All migration files"
$migrationNotes += (Section-CodeBlock $migrationFiles)

$migrationNotes += "### Latest files under supabase/"
$migrationNotes += (Section-CodeBlock $sqlFilesLatest)

# -----------------------------
# Compose markdown
# -----------------------------
$content = @"
# Technical Snapshot

## Timestamp
$timestamp

## Project Root
$projectRoot

## Git Branch
$branch

## Current HEAD
$currentHead

## Git Status (short)
$(Section-CodeBlock $statusShort)

## Git Status (full)
$(Section-CodeBlock $statusFull)

## Changed Files vs HEAD
$(Section-CodeBlock $changedFilesAll)

## Diff Stat vs HEAD
$(Section-CodeBlock $diffStatAll)

## Diff Summary vs HEAD
$(Section-CodeBlock $diffSummaryAll)

## Unstaged Files
$(Section-CodeBlock $unstagedFiles)

## Staged Files
$(Section-CodeBlock $stagedFiles)

## Recent Commits
$(Section-CodeBlock $recentCommits)

## Latest Files Under src/
$(Section-CodeBlock $srcFilesLatest)

## Latest Files Under tests/
$(Section-CodeBlock $testFilesLatest)

## Latest Files Under docs/
$(Section-CodeBlock $docsFilesLatest)

## AI State - latest task_for_curser_mmddhhmm.md
$(Section-CodeBlock $taskForCursor)

## AI State - latest cursor_report_mmddhhmm.md
$(Section-CodeBlock $cursorReport)

## AI State - project_state.md
$(Section-CodeBlock $projectState)

## AI Handoff Naming Rules
- Cursor must read the latest file in `ai/inbox/` named `task_for_curser_mmddhhmm.md`.
- Cursor must write its report to `ai/outbox/` using the filename pattern `cursor_report_mmddhhmm.md`.
- Timestamp format is `MMddHHmm`. Example: `03142358`.

## Environment Versions

### Node
$(Section-CodeBlock $nodeVersion)

### npm
$(Section-CodeBlock $npmVersion)

### npx
$(Section-CodeBlock $npxVersion)

### Supabase CLI
$(Section-CodeBlock $supabaseVersion)

## Test Output
$($testResults -join "`n`n")

## Migration State
$($migrationNotes -join "`n`n")
"@

Set-Content -Path $outPath -Value $content -Encoding UTF8

Write-Host ""
Write-Host "technical_snapshot.md generated:"
Write-Host $outPath
Write-Host ""