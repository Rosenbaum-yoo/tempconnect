#Requires -Version 5.1
<#
.SYNOPSIS
  TempConnect — Release Artifact Verifier (Windows)
.DESCRIPTION
  Prueft ein entpacktes Release-Verzeichnis auf verbotene Artefakte und Pflichtdateien.
.PARAMETER TargetDir
  Pfad zum entpackten Release-Verzeichnis.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetDir
)

$ErrorActionPreference = "Stop"
$violations = 0

function Write-Info { param($Msg) Write-Host "[verify] $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "[verify] $Msg" -ForegroundColor Yellow }
function Write-Fail { param($Msg) Write-Host "[verify] $Msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $TargetDir -PathType Container)) {
  Write-Fail "Verzeichnis nicht gefunden: $TargetDir"
}

$ResolvedTargetDir = (Resolve-Path $TargetDir).Path

function Test-RequiredFile {
  param([string]$RelativePath)

  $path = Join-Path $ResolvedTargetDir $RelativePath
  if (Test-Path $path -PathType Leaf) {
    Write-Info "Pflichtdatei vorhanden: $RelativePath"
  } else {
    Write-Warn "FEHLT: $RelativePath"
    $script:violations++
  }
}

function Test-ForbiddenDir {
  param([string]$DirName)

  $found = Get-ChildItem -Path $ResolvedTargetDir -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq $DirName } |
    Select-Object -First 1

  if ($found) {
    Write-Warn "VERBOTENES VERZEICHNIS gefunden: $DirName"
    $script:violations++
  } else {
    Write-Info "Kein $DirName im Release"
  }
}

Test-RequiredFile "docker-compose.prod.yml"
Test-RequiredFile "api\package.json"
Test-RequiredFile "scripts\prod-update.sh"
Test-RequiredFile "scripts\prod-up.sh"
Test-RequiredFile "scripts\backup.sh"
Test-RequiredFile "scripts\backup-verify.sh"
Test-RequiredFile "scripts\restore.sh"
Test-RequiredFile "scripts\restore-test.sh"
Test-RequiredFile "README.md"

$envFiles = Get-ChildItem -Path $ResolvedTargetDir -Recurse -Force -File -Filter ".env*" -ErrorAction SilentlyContinue
foreach ($file in $envFiles) {
  $relativePath = $file.FullName.Substring($ResolvedTargetDir.Length + 1)
  if ($file.Name -like "*.example") {
    Write-Info "Beispiel-Datei erlaubt: $relativePath"
  } else {
    Write-Warn "SECRET-DATEI im Release gefunden: $relativePath"
    $violations++
  }
}

foreach ($dir in @(".git", ".github", "node_modules", "coverage", ".c8_output", ".nyc_output")) {
  Test-ForbiddenDir $dir
}

foreach ($pattern in @("*.log", "*.tmp", "*.bak", "*.pid", "*.tar.gz", "*.zip")) {
  $found = Get-ChildItem -Path $ResolvedTargetDir -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($found) {
    Write-Warn "UNERWUENSCHTE DATEIEN gefunden: $pattern"
    $violations++
  } else {
    Write-Info "Keine Dateien mit Muster $pattern"
  }
}

if ($violations -gt 0) {
  Write-Fail "Release-Validierung fehlgeschlagen ($violations Problem(e))"
}

Write-Info "Release-Validierung bestanden"
