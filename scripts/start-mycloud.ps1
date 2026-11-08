[CmdletBinding()]
param(
  [int]$Port = 3000,
  [string]$BindAddress = "0.0.0.0",
  [switch]$NoBrowser,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "logs"
$AppOut = Join-Path $LogDir "app.out.log"
$AppErr = Join-Path $LogDir "app.error.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Write-Step {
  param([string]$Message)
  Write-Host "[MyCloud] $Message"
}

function Test-Listening {
  param([int]$LocalPort)
  return [bool](Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction SilentlyContinue)
}

function Wait-ForPort {
  param([int]$LocalPort, [int]$Seconds)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Listening -LocalPort $LocalPort) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Get-Health {
  param([int]$LocalPort)
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/api/health" `
      -Headers @{ Accept = "application/json" } -TimeoutSec 3
  } catch {
    return $null
  }
}

function Get-ConfiguredUrl {
  $envFile = Join-Path $ProjectRoot ".env.local"
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match "^\s*AUTH_URL\s*=\s*(.+?)\s*$") {
      return $Matches[1].Trim()
    }
  }
  return $null
}

function Get-LanAddress {
  $address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.PrefixOrigin -ne "WellKnown"
    } |
    Select-Object -First 1
  if ($address) { return $address.IPAddress }
  return $null
}

function Write-Urls {
  param([int]$LocalPort)
  $configuredUrl = Get-ConfiguredUrl
  Write-Step "This laptop: http://localhost:$LocalPort"
  if ($configuredUrl) {
    Write-Step "Same Wi-Fi:  $configuredUrl"
  } else {
    $lan = Get-LanAddress
    if ($lan) { Write-Step "Same Wi-Fi:  http://${lan}:$LocalPort" }
  }
}

# ---------------------------------------------------------------------------
# 1. MongoDB on loopback only
# ---------------------------------------------------------------------------
if (-not (Test-Listening -LocalPort 27017)) {
  $mongod = (Get-Command mongod -ErrorAction SilentlyContinue).Source
  if (-not $mongod) {
    $candidates = @(
      "C:\Users\Sam\Tools\mongodb-8.0.34\bin\mongod.exe",
      (Join-Path $ProjectRoot "tools\mongodb\bin\mongod.exe")
    )
    $candidates += Get-ChildItem "C:\Program Files\MongoDB\Server\*\bin\mongod.exe" `
      -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
    $mongod = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
      Select-Object -First 1
  }
  if (-not $mongod) {
    throw "MongoDB is not running and mongod.exe was not found. Install MongoDB or start it manually."
  }

  $configCandidates = @(
    "C:\Users\Sam\Tools\mongodb-8.0.34\mongod-mycloud.cfg",
    (Join-Path (Split-Path -Parent $mongod) "..\mongod-mycloud.cfg"),
    "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"
  )
  $config = $configCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
    Select-Object -First 1

  if ($config) {
    Write-Step "Starting MongoDB with $config"
    Start-Process -FilePath $mongod -ArgumentList "--config `"$config`"" -WindowStyle Hidden | Out-Null
  } else {
    $dataPath = "D:\MyCloudData\mongodb"
    $mongoLog = "D:\MyCloudData\logs\mongod.log"
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path -Parent $mongoLog) -Force | Out-Null
    Write-Step "Starting MongoDB with data folder $dataPath"
    Start-Process -FilePath $mongod -ArgumentList `
      "--dbpath `"$dataPath`" --logpath `"$mongoLog`" --bind_ip 127.0.0.1 --port 27017" `
      -WindowStyle Hidden | Out-Null
  }

  if (-not (Wait-ForPort -LocalPort 27017 -Seconds 60)) {
    throw "MongoDB did not start within 60 seconds. Check D:\MyCloudData\logs\mongod.log."
  }
}

# ---------------------------------------------------------------------------
# 2. Existing MyCloud process?
# ---------------------------------------------------------------------------
if (Test-Listening -LocalPort $Port) {
  $health = Get-Health -LocalPort $Port
  if ($health -and $health.status -eq "ok") {
    Write-Step "MyCloud is already running."
    Write-Urls -LocalPort $Port
    if (-not $NoBrowser) { Start-Process "http://localhost:$Port" | Out-Null }
    exit 0
  }
  throw "Port $Port is already in use by another program. Stop it, then run this script again."
}

# ---------------------------------------------------------------------------
# 3. Production build if needed
# ---------------------------------------------------------------------------
$buildId = Join-Path $ProjectRoot ".next\BUILD_ID"
if ($Rebuild -or -not (Test-Path -LiteralPath $buildId)) {
  Write-Step "Creating the production build. This can take a minute..."
  Push-Location $ProjectRoot
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
  } finally {
    Pop-Location
  }
}

# ---------------------------------------------------------------------------
# 4. Start Next.js
# ---------------------------------------------------------------------------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js was not found in PATH." }
$nextCli = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $nextCli)) {
  throw "Next.js is missing from node_modules. Run 'npm ci' in $ProjectRoot first."
}

Write-Step "Starting MyCloud on ${BindAddress}:$Port ..."
$process = Start-Process -FilePath $node `
  -ArgumentList "`"$nextCli`" start -H $BindAddress -p $Port" `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $AppOut `
  -RedirectStandardError $AppErr `
  -PassThru

$deadline = (Get-Date).AddSeconds(60)
$health = $null
while ((Get-Date) -lt $deadline) {
  $health = Get-Health -LocalPort $Port
  if ($health -and $health.status -eq "ok") { break }
  if ($process.HasExited) { break }
  Start-Sleep -Milliseconds 750
}

if (-not $health -or $health.status -ne "ok") {
  Write-Host ""
  Write-Host "MyCloud did not become healthy. Last error log lines:"
  if (Test-Path -LiteralPath $AppErr) { Get-Content -LiteralPath $AppErr -Tail 30 }
  throw "Startup failed. See $AppOut and $AppErr."
}

Write-Step "Ready."
Write-Urls -LocalPort $Port
Write-Step "Logs:        $AppOut"
Write-Step "             $AppErr"

if (-not $NoBrowser) { Start-Process "http://localhost:$Port" | Out-Null }
