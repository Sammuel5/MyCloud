param(
  [string]$Destination = "",
  [int]$Keep = 7,
  [string]$ServiceName = "MyCloud"
)

# Consistent backup wrapper for Task Scheduler or manual use.
# Stops the MyCloud service (if present and running), runs backup.ps1, then
# restarts the service even when the backup fails.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDirectory = Join-Path $ProjectRoot "logs"
$LogPath = Join-Path $LogDirectory "backup.log"

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

$transcriptStarted = $false
try {
  Start-Transcript -Path $LogPath -Append | Out-Null
  $transcriptStarted = $true
} catch {
  Write-Warning "Could not start transcript logging: $($_.Exception.Message)"
}

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date).ToString("o"), $Message
  Write-Host $line
  # When a transcript is active it already records this line. Only write
  # directly when transcript logging is unavailable.
  if (-not $script:transcriptStarted) {
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  }
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$wasRunning = $false

if ($service -and $service.Status -eq "Running") {
  Write-Log "Stopping service '$ServiceName' for a consistent backup..."
  Stop-Service -Name $ServiceName -Force
  (Get-Service -Name $ServiceName).WaitForStatus(
    [System.ServiceProcess.ServiceControllerStatus]::Stopped,
    [TimeSpan]::FromMinutes(2)
  )
  $wasRunning = $true
  Write-Log "Service '$ServiceName' stopped."
} elseif ($service) {
  Write-Log "Service '$ServiceName' is $($service.Status); no stop needed."
} else {
  Write-Log "Service '$ServiceName' was not found; backing up the live application tree."
}

$backupParams = @{ Keep = $Keep }
if ($Destination) { $backupParams["Destination"] = $Destination }

try {
  $destinationLabel = if ($Destination) { $Destination } else { "MYCLOUD_BACKUP_PATH" }
  Write-Log "Starting backup (Keep=$Keep, Destination=$destinationLabel)."
  & (Join-Path $PSScriptRoot "backup.ps1") @backupParams
  Write-Log "Backup completed successfully."
} catch {
  Write-Log "Backup FAILED: $($_.Exception.Message)"
  throw
} finally {
  if ($wasRunning) {
    Write-Log "Restarting service '$ServiceName'..."
    Start-Service -Name $ServiceName
    (Get-Service -Name $ServiceName).WaitForStatus(
      [System.ServiceProcess.ServiceControllerStatus]::Running,
      [TimeSpan]::FromMinutes(2)
    )
    Write-Log "Service '$ServiceName' is running."
  } elseif ($service -and $service.Status -eq "Running") {
    Write-Log "Service '$ServiceName' is still running."
  }

  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch { }
  }
}
