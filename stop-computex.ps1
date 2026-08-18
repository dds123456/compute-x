$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $projectRoot '.runtime'
$stateFile = Join-Path $runtimeRoot 'processes.json'

if (-not (Test-Path -LiteralPath $stateFile)) {
  Write-Host 'No ComputeX processes started by this launcher were found.' -ForegroundColor Yellow
  exit 0
}

$state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
foreach ($processId in @($state.webPid, $state.serverPid)) {
  if ($processId) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'node') {
      Stop-Process -Id $processId -Force
    }
  }
}

Remove-Item -LiteralPath $stateFile -Force
Write-Host 'ComputeX stopped.' -ForegroundColor Green
