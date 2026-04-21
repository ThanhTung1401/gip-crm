$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPidFile = Join-Path $root ".crm-server.pid"
$backendPidFile = Join-Path $root ".crm-backend.pid"
$frontendPort = 4173
$backendPort = 8787

$configServiceKey = Join-Path $root "config\google-service-account.json"
$rootServiceKey = Join-Path $root "google-service-account.json"
if (-not $env:GOOGLE_SERVICE_ACCOUNT_KEY) {
  if (Test-Path $configServiceKey) {
    $env:GOOGLE_SERVICE_ACCOUNT_KEY = $configServiceKey
  } elseif (Test-Path $rootServiceKey) {
    $env:GOOGLE_SERVICE_ACCOUNT_KEY = $rootServiceKey
  }
}

function Stop-ExistingProcess($pidFile) {
  if (-not (Test-Path $pidFile)) {
    return
  }

  $existingPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($existingPid) {
    $proc = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
    }
  }

  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Stop-ExistingProcess $frontendPidFile
Stop-ExistingProcess $backendPidFile

Push-Location $root
try {
  & npm.cmd run build | Out-Host

  $backendProc = Start-Process -FilePath "node.exe" -ArgumentList @("server.js") -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Set-Content -Path $backendPidFile -Value $backendProc.Id

  $frontendProc = Start-Process -FilePath "python.exe" -ArgumentList @("-m", "http.server", "$frontendPort", "--directory", "dist") -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Set-Content -Path $frontendPidFile -Value $frontendProc.Id

  Write-Output "CRM frontend started at http://127.0.0.1:$frontendPort"
  Write-Output "CRM backend started at http://127.0.0.1:$backendPort"
} finally {
  Pop-Location
}
