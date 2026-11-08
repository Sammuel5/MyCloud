param(
  [string]$TaskName = "MyCloud Backup",
  [string]$Time = "02:30",
  [int]$Keep = 7,
  [string]$Destination = "",
  [string]$ServiceName = "MyCloud"
)

# Registers a daily, service-aware backup task. Must run elevated because the
# task uses the SYSTEM principal and stops/starts the MyCloud service.

$ErrorActionPreference = "Stop"

$principalCheck = New-Object Security.Principal.WindowsPrincipal(
  [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run PowerShell as Administrator to register a SYSTEM scheduled task."
}

if ($Time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') {
  throw "Time must use 24-hour HH:mm format, for example 02:30."
}
if ($Keep -lt 1) {
  throw "Keep must be at least 1."
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$backupScript = Join-Path $PSScriptRoot "scheduled-backup.ps1"
if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
  throw "Missing backup wrapper: $backupScript"
}

if ($Destination) {
  $destinationFull = [System.IO.Path]::GetFullPath($Destination)
  $envFile = Join-Path $ProjectRoot ".env.local"
  if (Test-Path -LiteralPath $envFile) {
    $storageLine = Get-Content -LiteralPath $envFile |
      Where-Object { $_ -match '^\s*MYCLOUD_STORAGE_PATH\s*=' } |
      Select-Object -First 1
    if ($storageLine) {
      $storagePath = ($storageLine -split "=", 2)[1].Trim().Trim('"').Trim("'")
      if ($storagePath) {
        $storageFull = [System.IO.Path]::GetFullPath($storagePath).TrimEnd('\')
        if ($destinationFull.TrimEnd('\') -eq $storageFull -or
            $destinationFull.StartsWith($storageFull + '\')) {
          throw "The backup destination must not be inside MYCLOUD_STORAGE_PATH."
        }
      }
    }
  }
}

$argumentParts = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$backupScript`"",
  "-Keep", "$Keep",
  "-ServiceName", "`"$ServiceName`""
)
if ($Destination) {
  $argumentParts += @("-Destination", "`"$Destination`"")
}
$arguments = $argumentParts -join " "

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Warning "Service '$ServiceName' is not installed. The task will back up the live tree until the service exists."
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $arguments `
  -WorkingDirectory $ProjectRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)

$principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

$description = "Stops $ServiceName, backs up storage and MongoDB, then restarts the service. Keeps $Keep backups."

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description $description `
  -Force | Out-Null

Write-Host ""
Write-Host "Scheduled backup registered."
Write-Host "  Task:        $TaskName"
Write-Host "  Time:        $Time (daily, local time)"
Write-Host "  Keep:        $Keep"
Write-Host "  Destination: $(if ($Destination) { $Destination } else { 'MYCLOUD_BACKUP_PATH from .env.local' })"
Write-Host "  Script:      $backupScript"
Write-Host "  Log:         $(Join-Path $ProjectRoot 'logs\backup.log')"
Write-Host ""
Write-Host "Verify with:"
Write-Host "  Get-ScheduledTask -TaskName `"$TaskName`""
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "  Get-Content `"$(Join-Path $ProjectRoot 'logs\backup.log')`" -Tail 60"
