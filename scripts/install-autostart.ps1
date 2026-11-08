[CmdletBinding()]
param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "MyCloud.lnk"

if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    Write-Host "Removed the MyCloud auto-start shortcut."
  } else {
    Write-Host "The MyCloud auto-start shortcut was not installed."
  }
  exit 0
}

$powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$script = Join-Path $ProjectRoot "scripts\start-mycloud.ps1"

if (-not (Test-Path -LiteralPath $script)) {
  throw "Start script not found at $script"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShell
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -NoBrowser"
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = "Start the MyCloud personal cloud drive at Windows sign-in"
$shortcut.Save()

Write-Host "Auto-start installed."
Write-Host "  Shortcut: $shortcutPath"
Write-Host "  Action:   starts MongoDB and MyCloud when you sign in to Windows"
Write-Host ""
Write-Host "It will start the next time you sign in. To start it now:"
Write-Host "  $ProjectRoot\Start-MyCloud.cmd"
Write-Host ""
Write-Host "To remove it later:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Remove"
