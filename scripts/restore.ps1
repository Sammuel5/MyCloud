param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [string]$StoragePath = "",
  [string]$MongoUri = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
$EnvFile = Join-Path $ProjectRoot ".env.local"

function Read-DotEnv {
  param([string]$Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $index = $line.IndexOf("=")
    if ($index -lt 1) { continue }
    $key = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim()
    if ($value.Length -ge 2 -and (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    )) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Resolve-Executable {
  param([string]$Name, [string[]]$FallbackRoots)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($root in $FallbackRoots) {
    if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
    $direct = Join-Path $root "$Name.exe"
    if (Test-Path -LiteralPath $direct) { return $direct }
    $candidate = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }
  return $null
}

$Source = [System.IO.Path]::GetFullPath($Source)
$manifestPath = Join-Path $Source "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "This does not look like a MyCloud backup (manifest.json is missing): $Source"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$sourceStorage = Join-Path $Source "storage"
if (-not (Test-Path -LiteralPath $sourceStorage -PathType Container)) {
  throw "The backup does not contain a storage folder: $sourceStorage"
}

$envValues = Read-DotEnv -Path $EnvFile
if (-not $StoragePath) { $StoragePath = $envValues["MYCLOUD_STORAGE_PATH"] }
if (-not $MongoUri) { $MongoUri = $envValues["MONGODB_URI"] }
if (-not $StoragePath) { throw "Provide -StoragePath or set MYCLOUD_STORAGE_PATH in .env.local." }

$storageFull = [System.IO.Path]::GetFullPath($StoragePath)
if ([System.IO.Path]::GetPathRoot($storageFull) -eq $storageFull) {
  throw "Refusing to restore into a filesystem root: $storageFull"
}

$listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  throw "Something is listening on port 3000. Stop the MyCloud service/app before restoring."
}
$service = Get-Service -Name "MyCloud" -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
  throw "The MyCloud service is running. Stop it first: Stop-Service MyCloud"
}

Write-Host "MyCloud restore"
Write-Host "  Backup:      $Source"
Write-Host "  Created:     $($manifest.createdAt)"
Write-Host "  Mongo dump:  $($manifest.databaseBackupIncluded)"
Write-Host "  Storage:     $storageFull"
Write-Host ""
Write-Warning "This replaces the current storage tree and (if included) drops and restores the database."

if (-not $Force) {
  $answer = Read-Host "Type RESTORE to continue"
  if ($answer -ne "RESTORE") { throw "Restore cancelled." }
}

New-Item -ItemType Directory -Path $storageFull -Force | Out-Null
Write-Host "`n[1/2] Restoring storage..."
$robocopyArgs = @(
  $sourceStorage,
  $storageFull,
  "/MIR",
  "/COPY:DAT",
  "/DCOPY:DAT",
  "/R:1",
  "/W:1",
  "/XJ",
  "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
)
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed with exit code $LASTEXITCODE." }
Write-Host "  Storage restored."

if ($manifest.databaseBackupIncluded) {
  if (-not $MongoUri) { throw "MONGODB_URI is required to restore the database." }
  $archive = Join-Path $Source "mongo.archive.gz"
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw "The database archive is missing: $archive"
  }
  Write-Host "`n[2/2] Restoring MongoDB..."
  $mongorestore = Resolve-Executable -Name "mongorestore" -FallbackRoots @(
    (Join-Path $env:ProgramFiles "MongoDB\Server"),
    (Join-Path $env:USERPROFILE "Tools\mongodb-database-tools\bin"),
    (Join-Path $ProjectRoot "tools\mongodb-database-tools\bin"),
    (Join-Path $ProjectRoot "tools")
  )
  if (-not $mongorestore) {
    throw "mongorestore was not found. Add the MongoDB Server bin folder to PATH or install MongoDB Database Tools."
  }
  & $mongorestore "--uri=$MongoUri" "--archive=$archive" "--gzip" "--drop"
  if ($LASTEXITCODE -ne 0) { throw "mongorestore failed with exit code $LASTEXITCODE." }
  Write-Host "  MongoDB restored."
} else {
  Write-Host "`n[2/2] No database archive in this backup; storage restored only."
}

Write-Host "`nRestore complete. Run 'npm run setup' to verify storage/MongoDB and synchronize indexes, then start MyCloud."
