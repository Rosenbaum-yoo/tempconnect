#Requires -Version 5.1
<#
.SYNOPSIS
  TempConnect — Release Package Builder (Windows)
.DESCRIPTION
  Erstellt ein sauberes Release-ZIP, bevorzugt direkt aus einem Git-Ref.
  Automatische Validierung: keine .env, kein .git/.github, keine node_modules, keine Coverage-Daten.
.PARAMETER Version
  Release-Version (z.B. "v2026.04.07"). Standard: aktuelles Datum.
.PARAMETER Ref
  Git-Ref fuer das Release. Standard: HEAD.
.EXAMPLE
  .\scripts\release-package.ps1
  .\scripts\release-package.ps1 -Version v2026.04.07 -Ref v2026.04.07
#>
param(
  [string]$Version = (Get-Date -Format "yyyy-MM-dd"),
  [string]$Ref = "HEAD"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$ProjectName = "tempconnect"
$ArchiveName = "$ProjectName-$Version"
$ReleaseDir = Join-Path $ProjectDir "release"
$StagingDir = Join-Path $ReleaseDir $ArchiveName
$ArchiveFile = Join-Path $ReleaseDir "$ArchiveName.zip"
$VerifyScript = Join-Path $ScriptDir "release-verify.ps1"
$SourceMode = "working-tree"

$ExcludeDirs = @(
  ".git",
  ".github",
  "node_modules",
  "coverage",
  ".c8_output",
  ".nyc_output",
  "tmp",
  "data",
  "db-data",
  "redis-data",
  "backups",
  "uploads",
  "dist",
  "build",
  "release",
  ".idea",
  ".vscode",
  ".warp"
)

$ExcludeFiles = @(
  ".env",
  ".env.local",
  ".env.dev",
  ".env.prod",
  "docker-compose.override.yml",
  "*.log",
  "*.tmp",
  "*.bak",
  "*.pid",
  "*.swp",
  "*.swo",
  "*.tar.gz",
  "*.zip",
  "Thumbs.db",
  ".DS_Store",
  "desktop.ini"
)

$KeepPatterns = @("*.example")

function Write-Info { param($Msg) Write-Host "[release] $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "[release] $Msg" -ForegroundColor Yellow }
function Write-Fail { param($Msg) Write-Host "[release] $Msg" -ForegroundColor Red; exit 1 }

function Test-ShouldExclude {
  param([string]$RelPath)

  foreach ($keep in $KeepPatterns) {
    if ($RelPath -like $keep) {
      return $false
    }
  }

  $parts = $RelPath -split '[/\\]'
  foreach ($dir in $ExcludeDirs) {
    if ($parts -contains $dir) {
      return $true
    }
  }

  $fileName = Split-Path -Leaf $RelPath
  foreach ($pattern in $ExcludeFiles) {
    if ($fileName -like $pattern) {
      return $true
    }
  }

  return $false
}

Write-Info "Release-Paket: $ArchiveName"
Write-Info "Quelle: $ProjectDir"

if (-not (Test-Path (Join-Path $ProjectDir "docker-compose.prod.yml"))) {
  Write-Fail "Kein docker-compose.prod.yml gefunden"
}
if (-not (Test-Path (Join-Path $ProjectDir "api\package.json"))) {
  Write-Fail "api\package.json fehlt"
}
if (-not (Test-Path (Join-Path $ProjectDir "scripts\prod-update.sh"))) {
  Write-Fail "scripts\prod-update.sh fehlt"
}
if (-not (Test-Path $VerifyScript)) {
  Write-Fail "scripts\release-verify.ps1 fehlt"
}

if (-not (Test-Path $ReleaseDir)) {
  New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
}
if (Test-Path $StagingDir) {
  Remove-Item $StagingDir -Recurse -Force
}
if (Test-Path $ArchiveFile) {
  Remove-Item $ArchiveFile -Force
}

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$gitDir = Join-Path $ProjectDir ".git"

if ($gitCommand -and (Test-Path $gitDir)) {
  & git -C $ProjectDir rev-parse --verify "$Ref^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Fail "Git-Ref '$Ref' existiert nicht oder ist kein Commit"
  }

  $SourceMode = "git-archive"
  $tempGitZip = Join-Path $ReleaseDir "$ArchiveName.git.zip"
  if (Test-Path $tempGitZip) {
    Remove-Item $tempGitZip -Force
  }

  Write-Info "Erzeuge Staging aus Git-Ref '$Ref' ..."
  & git -C $ProjectDir archive --format=zip "--prefix=$ArchiveName/" -o $tempGitZip $Ref
  Expand-Archive -Path $tempGitZip -DestinationPath $ReleaseDir -Force
  Remove-Item $tempGitZip -Force

  $githubDir = Join-Path $StagingDir ".github"
  if (Test-Path $githubDir) {
    Remove-Item $githubDir -Recurse -Force
  }
} else {
  Write-Warn "Git-Archivierung nicht verfuegbar — verwende Arbeitsbaum als Fallback."
  New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

  $allItems = Get-ChildItem -Path $ProjectDir -Recurse -Force -ErrorAction SilentlyContinue
  foreach ($item in $allItems) {
    $relPath = $item.FullName.Substring($ProjectDir.Length + 1)

    if (Test-ShouldExclude $relPath) {
      continue
    }

    $destPath = Join-Path $StagingDir $relPath
    if ($item.PSIsContainer) {
      if (-not (Test-Path $destPath)) {
        New-Item -ItemType Directory -Path $destPath -Force | Out-Null
      }
    } else {
      $destDir = Split-Path -Parent $destPath
      if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
      }
      Copy-Item $item.FullName -Destination $destPath -Force
    }
  }
}

Write-Info "Validiere Release-Staging ..."
& $VerifyScript -TargetDir $StagingDir
if (-not $?) {
  Write-Fail "Release-Validierung fehlgeschlagen"
}

Write-Info "Erstelle $ArchiveFile ..."
Compress-Archive -Path $StagingDir -DestinationPath $ArchiveFile -CompressionLevel Optimal

$sha = (Get-FileHash -Path $ArchiveFile -Algorithm SHA256).Hash.ToLower()
$fileCount = @(Get-ChildItem -Path $StagingDir -File -Recurse -Force).Count
$fileSize = "{0:N1} MB" -f ((Get-Item $ArchiveFile).Length / 1MB)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ArchiveFile)
try {
  $entries = $zip.Entries | Select-Object -ExpandProperty FullName
} finally {
  $zip.Dispose()
}

$ManifestFile = Join-Path $ReleaseDir "$ArchiveName.manifest.txt"
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$manifestLines = @(
  "# TempConnect Release Manifest",
  "# Erstellt: $timestamp",
  "# Version: $Version",
  "",
  "Archive: $ArchiveName.zip",
  "Source mode: $SourceMode",
  "Source ref: $Ref",
  "SHA-256: $sha",
  "",
  "# Inhalt:"
)
$manifestLines += ($entries | Select-Object -First 50)
if ($entries.Count -gt 50) {
  $manifestLines += "..."
}
$manifestLines += @(
  "",
  "# Ausgeschlossene Kategorien:",
  "#   - .env / Secrets",
  "#   - .git / VCS-History",
  "#   - .github / CI-Metadaten",
  "#   - node_modules / Dependencies",
  "#   - coverage / .c8_output / Test-Artefakte",
  "#   - Logs, Temp-Dateien, Data Volumes",
  "#   - IDE-Config, OS-Artefakte"
)
$manifestLines -join "`r`n" | Out-File -FilePath $ManifestFile -Encoding UTF8

Remove-Item $StagingDir -Recurse -Force

Write-Host ""
Write-Info "========================================================="
Write-Info "Release-Paket erstellt"
Write-Info "========================================================="
Write-Info "Datei:    $ArchiveFile"
Write-Info "Groesse:  $fileSize"
Write-Info "Dateien:  $fileCount"
Write-Info "Quelle:   $SourceMode ($Ref)"
Write-Info "SHA-256:  $sha"
Write-Info "Manifest: $ManifestFile"
Write-Info "========================================================="
Write-Host ""
Write-Info "Naechste Schritte:"
Write-Info "  1. Manifest pruefen:  Get-Content $ManifestFile"
Write-Info "  2. Paket testen:      Expand-Archive $ArchiveFile -DestinationPath .\test-release"
Write-Info "  3. Deployment:        Release-Artefakt auf den Server kopieren und dort entpacken"
