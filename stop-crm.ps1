$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPidFile = Join-Path $root ".crm-server.pid"
$backendPidFile = Join-Path $root ".crm-backend.pid"

function Stop-FromPidFile($pidFile) {
  if (-not (Test-Path $pidFile)) {
    return $false
  }

  $pidValue = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($pidValue) {
    $proc = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $proc.Id
    }
  }

  Remove-Item $pidFile -ErrorAction SilentlyContinue
  return $true
}

$frontendStopped = Stop-FromPidFile $frontendPidFile
$backendStopped = Stop-FromPidFile $backendPidFile

if (-not $frontendStopped -and -not $backendStopped) {
  Write-Output "CRM is not running."
  exit 0
}

Write-Output "CRM stopped."
