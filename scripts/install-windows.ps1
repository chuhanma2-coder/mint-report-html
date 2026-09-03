param(
  [string]$Repository = "https://github.com/chuhanma2-coder/mint-report-html.git",
  [string]$Ref = "main",
  [switch]$DeactivateDeck
)

$ErrorActionPreference = "Stop"
$skillsRoot = Join-Path $env:USERPROFILE ".codex\skills"
$destination = Join-Path $skillsRoot "mint-report-html"
$backupRoot = Join-Path $env:USERPROFILE ".codex\skill-backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$temporary = Join-Path $env:TEMP "mint-report-html-$stamp"
$backup = Join-Path $backupRoot "mint-report-html-$stamp"

New-Item -ItemType Directory -Force -Path $skillsRoot, $backupRoot | Out-Null
git clone --depth 1 --branch $Ref $Repository $temporary
if (-not (Test-Path (Join-Path $temporary "SKILL.md"))) { throw "Downloaded repository is not a valid Skill." }

if (Test-Path $destination) { Move-Item $destination $backup }
try {
  Move-Item $temporary $destination
} catch {
  if ((Test-Path $backup) -and -not (Test-Path $destination)) { Move-Item $backup $destination }
  throw
}

$deck = Join-Path $skillsRoot "mint-report-deck"
if ($DeactivateDeck -and (Test-Path $deck)) { Move-Item $deck (Join-Path $backupRoot "mint-report-deck-$stamp") }

Write-Host "Mint Report HTML updated from $Repository ($Ref)."
Write-Host "Active Skill: $destination"
if ((Test-Path $deck) -and -not $DeactivateDeck) { Write-Warning "mint-report-deck is still active. Explicitly invoke `$mint-report-html, or rerun with -DeactivateDeck for an HTML-only setup." }
node (Join-Path $destination "scripts\check-skill-installation.mjs")
if ($LASTEXITCODE -ne 0) { Write-Warning "Skill updated, but the active-Skill conflict check found an issue. Read the report above before starting a new task." }
if (Test-Path $backup) { Write-Host "Previous version backup: $backup" }
