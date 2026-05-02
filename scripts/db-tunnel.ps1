# Mở tunnel để Beekeeper/script trên Windows dùng CÙNG URL với shell trên VPS:
#   postgresql://USER:PASS@127.0.0.1:6432/DBNAME
#
# Usage:
#   .\scripts\db-tunnel.ps1 -SshTarget root@161.248.146.6
#   .\scripts\db-tunnel.ps1 -SshTarget root@vps.example.com -LocalPort 16432

param(
    [Parameter(Mandatory = $true)]
    [string] $SshTarget,
    [int] $LocalPort = 6432,
    [int] $RemotePgPort = 6432
)

$bind = "${LocalPort}:127.0.0.1:${RemotePgPort}"
ssh -N -o ExitOnForwardFailure=yes -L $bind $SshTarget
