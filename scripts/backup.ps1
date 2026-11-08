param(
  [string]$Destination = "",
  [int]$Keep = 7,
  [switch]$SkipDatabase
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

$envValues = Read-DotEnv -Path $EnvFile
$storagePath = $envValues["MYCLOUD_STORAGE_PATH"]
$mongoUri = $envValues["MONGODB_URI"]

if (-not $storagePath) { throw "MYCLOUD_STORAGE_PATH is missing from .env.local." }
if (-not (Test-Path -LiteralPath $storagePath -PathType Container)) {
  throw "Storage path does not exist: $storagePath"
}
if (-not $Destination) {
  $Destination = $envValues["MYCLOUD_BACKUP_PATH"]
  if (-not $Destination) { $Destination = Join-Path $ProjectRoot "backups-local" }
}
$Destination = [System.IO.Path]::GetFullPath($Destination)
$storageFull = [System.IO.Path]::GetFullPath($storagePath).TrimEnd('\')
if ($Destination.TrimEnd('\') -eq $storageFull -or $Destination.StartsWith($storageFull + '\')) {
  throw "The backup destination must not be inside the storage folder."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $Destination "mycloud-$timestamp"
$storageBackup = Join-Path $backupRoot "storage"
New-Item -ItemType Directory -Path $storageBackup -Force | Out-Null

Write-Host "MyCloud backup"
Write-Host "  Storage:     $storagePath"
Write-Host "  Destination: $backupRoot"
Write-Host "  Keep:        $Keep"

Write-Host "`n[1/2] Copying storage (excluding temporary upload chunks)..."
$robocopyArgs = @(
  $storagePath,
  $storageBackup,
  "/E",
  "/COPY:DAT",
  "/DCOPY:DAT",
  "/R:1",
  "/W:1",
  "/XJ",
  "/XD", (Join-Path $storagePath "temp"),
  "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
)
& robocopy @robocopyArgs | Out-Null
$copyCode = $LASTEXITCODE
if ($copyCode -ge 8) { throw "Robocopy failed with exit code $copyCode." }
Write-Host "  Storage copied (robocopy exit code $copyCode)."

$mongoBackup = Join-Path $backupRoot "mongo.archive.gz"
$databaseBackedUp = $false

if (-not $SkipDatabase) {
  if (-not $mongoUri) { throw "MONGODB_URI is missing from .env.local." }
  Write-Host "`n[2/2] Dumping MongoDB..."
  $mongodump = Resolve-Executable -Name "mongodump" -FallbackRoots @(
    (Join-Path $env:ProgramFiles "MongoDB\Server"),
    (Join-Path $env:USERPROFILE "Tools\mongodb-database-tools\bin"),
    (Join-Path $ProjectRoot "tools\mongodb-database-tools\bin"),
    (Join-Path $ProjectRoot "tools")
  )
  if (-not $mongodump) {
    throw "mongodump was not found. Add the MongoDB Server bin folder to PATH, install MongoDB Database Tools, or re-run with -SkipDatabase for a storage-only backup."
  }
  & $mongodump "--uri=$mongoUri" "--archive=$mongoBackup" "--gzip"
  if ($LASTEXITCODE -ne 0) { throw "mongodump failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath $mongoBackup) -or (Get-Item -LiteralPath $mongoBackup).Length -eq 0) {
    throw "The MongoDB archive was not created."
  }
  $databaseBackedUp = $true
  Write-Host "  MongoDB archive written."
} else {
  Write-Host "`n[2/2] Skipping MongoDB (-SkipDatabase)."
}

$manifest = [ordered]@{
  application = "MyCloud"
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceHost = $env:COMPUTERNAME
  storageBackupIncluded = $true
  databaseBackupIncluded = $databaseBackedUp
  mongoArchive = $(if ($databaseBackedUp) { "mongo.archive.gz" } else { $null })
  storageDirectory = "storage"
  note = "Stop the MyCloud service before restoring. Storage is restored with robocopy /MIR."
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupRoot "manifest.json") -Encoding UTF8

Write-Host "`nBackup complete: $backupRoot"

if ($Keep -gt 0 -and (Test-Path -LiteralPath $Destination)) {
  $backups = Get-ChildItem -LiteralPath $Destination -Directory |
    Where-Object { $_.Name -like "mycloud-*" } |
    Sort-Object Name -Descending
  $old = $backups | Select-Object -Skip $Keep
  foreach ($item in $old) {
    Write-Host "Removing old backup: $($item.FullName)"
    Remove-Item -LiteralPath $item.FullName -Recurse -Force
  }
}
