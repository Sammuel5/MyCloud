[CmdletBinding()]
param(
  [int]$Port = 3000,
  [switch]$IncludeMongo
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[MyCloud] $Message"
}

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Step "The MyCloud web server is not running."
} else {
  foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process -and ($process.CommandLine -match "next" -or $process.ExecutablePath -like "*node.exe")) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Write-Step "Stopped the MyCloud web server (PID $processId)."
    } else {
      Write-Warning "Port $Port is used by PID $processId, but it does not look like MyCloud. It was left running."
    }
  }
}

if ($IncludeMongo) {
  $mongo = Get-Process mongod -ErrorAction SilentlyContinue
  if ($mongo) {
    $mongo | Stop-Process -Force
    Write-Step "Stopped MongoDB."
  } else {
    Write-Step "MongoDB is not running."
  }
}

Write-Step "Done."
