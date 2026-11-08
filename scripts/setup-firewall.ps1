param(
  [switch]$AllowLan
)

$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run PowerShell as Administrator to change firewall rules."
}

# MongoDB must never be reachable from the network. This is defense in depth:
# the default MONGODB_URI only listens on 127.0.0.1 anyway.
foreach ($protocol in @("TCP", "UDP")) {
  $name = "MyCloud - Block MongoDB 27017 ($protocol)"
  Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Block `
    -Protocol $protocol -LocalPort 27017 -Profile Any | Out-Null
  Write-Host "Blocked inbound MongoDB $protocol/27017."
}

$ruleName = "MyCloud - Web (Private LAN)"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

if ($AllowLan) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet | Out-Null
  Write-Host "Allowed TCP/3000 from the local subnet on Private networks."
  Write-Warning "Only do this on a trusted LAN. The app must also bind 0.0.0.0 (npm run start:lan) and AUTH_URL must match the address you use."
} else {
  Write-Host "No LAN web rule created. Tailscale Serve is preferred and needs no inbound firewall rule."
}

Write-Host "`nFirewall configuration complete."
