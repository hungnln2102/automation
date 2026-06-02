$ErrorActionPreference = "Stop"

$VpsHost = if ($env:VPS_SSH_HOST) { $env:VPS_SSH_HOST } else { "161.248.146.6" }
$VpsUser = if ($env:VPS_SSH_USER) { $env:VPS_SSH_USER } else { "root" }
$LocalPort = if ($env:VPS_DB_TUNNEL_PORT) { $env:VPS_DB_TUNNEL_PORT } else { "5432" }

Write-Host ""
Write-Host "[tunnel:vps] Mo cua so SSH tunnel toi ${VpsUser}@${VpsHost}..."
Write-Host "[tunnel:vps] Nhap mat khau VPS (neu duoc hoi), GIU cua so mo."
Write-Host "[tunnel:vps] Sau do chay: npm run db:check  hoac  npm run dev"
Write-Host ""

Start-Process ssh -ArgumentList @(
  "-L", "${LocalPort}:127.0.0.1:${LocalPort}",
  "${VpsUser}@${VpsHost}"
)
