param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$tailscale = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $tailscale) {
  throw "Tailscale CLI was not found. Install Tailscale, sign in, then run this script again."
}

Write-Host "Current Tailscale status:"
& $tailscale status
if ($LASTEXITCODE -ne 0) { throw "Tailscale is not connected." }

Write-Host "`nPublishing MyCloud on your tailnet with HTTPS..."
& $tailscale serve --bg --https=443 "http://127.0.0.1:$Port"
if ($LASTEXITCODE -ne 0) {
  throw "Tailscale Serve failed. Try manually: tailscale serve --bg --https=443 http://127.0.0.1:$Port"
}

$statusJson = & $tailscale status --json | ConvertFrom-Json
$dnsName = $statusJson.Self.DNSName
if ($dnsName) { $dnsName = $dnsName.TrimEnd(".") }

Write-Host "`nTailscale Serve status:"
& $tailscale serve status

if ($dnsName) {
  Write-Host ""
  Write-Host "Open this URL from any device on your tailnet:"
  Write-Host "  https://$dnsName"
  Write-Host ""
  Write-Host "Set this in .env.local and restart MyCloud:"
  Write-Host "  AUTH_URL=https://$dnsName"
  Write-Host ""
  Write-Host "Note: HTTPS certificates are issued by Tailscale for your tailnet name."
} else {
  Write-Host "Could not determine the tailnet DNS name. Run 'tailscale status --json' and use Self.DNSName."
}

Write-Host "`nTailscale Serve proxies only to 127.0.0.1:$Port; MongoDB and the Next.js port stay private."
