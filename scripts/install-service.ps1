param(
  [string]$ServiceName = "MyCloud",
  [int]$Port = 3000,
  [ValidateSet("127.0.0.1", "0.0.0.0")]
  [string]$BindAddress = "127.0.0.1",
  [string]$NssmPath = "",
  [string]$AppDirectory = "",
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run PowerShell as Administrator to install a Windows service."
}

if (-not $AppDirectory) {
  $AppDirectory = (Split-Path -Parent $PSScriptRoot)
}
$AppDirectory = [System.IO.Path]::GetFullPath($AppDirectory)
if (-not (Test-Path -LiteralPath (Join-Path $AppDirectory ".next\BUILD_ID"))) {
  throw "No production build found. Run 'npm run build' in $AppDirectory first."
}
if (-not (Test-Path -LiteralPath (Join-Path $AppDirectory ".env.local"))) {
  throw ".env.local is missing. Complete configuration and run 'npm run setup' first."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js was not found in PATH." }
$nextCli = Join-Path $AppDirectory "node_modules\next\dist\bin\next"
if (-not (Test-Path -LiteralPath $nextCli)) {
  throw "Next.js CLI was not found at $nextCli. Run 'npm install' first."
}

if (-not $NssmPath) {
  $candidates = @(
    (Get-Command nssm -ErrorAction SilentlyContinue).Source,
    "C:\ProgramData\chocolatey\bin\nssm.exe",
    "C:\Tools\nssm\nssm.exe",
    (Join-Path $AppDirectory "tools\nssm.exe")
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if (-not $candidates) {
    throw "NSSM was not found. Install it with 'winget install NSSM.NSSM' or 'choco install nssm', then re-run this script with -NssmPath C:\path\to\nssm.exe."
  }
  $NssmPath = $candidates
}

$logs = Join-Path $AppDirectory "logs"
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$stdout = Join-Path $logs "service.out.log"
$stderr = Join-Path $logs "service.error.log"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Reconfiguring existing service '$ServiceName'..."
  & $NssmPath stop $ServiceName | Out-Null
  & $NssmPath set $ServiceName Application $node
} else {
  Write-Host "Installing service '$ServiceName'..."
  & $NssmPath install $ServiceName $node
}

$arguments = "`"$nextCli`" start -H $BindAddress -p $Port"
& $NssmPath set $ServiceName AppParameters $arguments
& $NssmPath set $ServiceName AppDirectory $AppDirectory
& $NssmPath set $ServiceName DisplayName "MyCloud personal drive"
& $NssmPath set $ServiceName Description "Self-hosted MyCloud drive (Next.js) on ${BindAddress}:$Port"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout $stdout
& $NssmPath set $ServiceName AppStderr $stderr
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 10485760
& $NssmPath set $ServiceName AppStopMethodConsole 15000
& $NssmPath set $ServiceName AppExit Default Restart
& $NssmPath set $ServiceName AppRestartDelay 5000
& $NssmPath set $ServiceName AppThrottle 5000
& $NssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production"

if (-not $NoStart) {
  & $NssmPath start $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Service configured: $ServiceName"
Write-Host "  App:      $AppDirectory"
$bindLabel = if ($BindAddress -eq "0.0.0.0") { "all interfaces (LAN mode)" } else { "loopback only" }
Write-Host "  Bind:     http://${BindAddress}:$Port ($bindLabel)"
Write-Host "  Logs:     $stdout"
Write-Host "            $stderr"
Write-Host "  Status:   $((Get-Service -Name $ServiceName).Status)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run 'npm run healthcheck' to verify the app."
Write-Host "  2. Run 'powershell -ExecutionPolicy Bypass -File scripts/setup-tailscale.ps1' for private HTTPS access."
Write-Host "  3. Remember to rebuild and restart the service after code or environment changes."
