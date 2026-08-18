param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Join-Path $projectRoot 'server'
$webRoot = Join-Path $projectRoot 'web'
$runtimeRoot = Join-Path $projectRoot '.runtime'
$stateFile = Join-Path $runtimeRoot 'processes.json'

function Test-HttpEndpoint([string]$Uri) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Wait-HttpEndpoint([string]$Uri, [int]$Attempts = 40) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    if (Test-HttpEndpoint $Uri) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Stop-StartedProcess($Process) {
  if ($null -ne $Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $nodeCommand -or -not $npmCommand) {
  throw 'Node.js / npm was not found. Install Node.js 24 or newer first.'
}

$apiAlreadyReady = Test-HttpEndpoint 'http://127.0.0.1:8787/api/health'
$webAlreadyReady = Test-HttpEndpoint 'http://127.0.0.1:5173'
if ($apiAlreadyReady -and $webAlreadyReady) {
  Write-Host 'ComputeX is already running.' -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5173' }
  exit 0
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $serverRoot 'node_modules'))) {
  Write-Host 'First launch: installing server dependencies...' -ForegroundColor Cyan
  Push-Location $serverRoot
  try { & $npmCommand.Source ci } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Server dependency installation failed.' }
}

if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'node_modules'))) {
  Write-Host 'First launch: installing web dependencies...' -ForegroundColor Cyan
  Push-Location $webRoot
  try { & $npmCommand.Source ci } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed.' }
}

$viteEntry = Join-Path $webRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $viteEntry)) { throw 'Vite entry point is missing. Remove web/node_modules and retry.' }

$env:NODE_ENV = 'development'
$serverProcess = $null
$webProcess = $null

try {
  $serverProcess = Start-Process -FilePath $nodeCommand.Source `
    -ArgumentList @('src/index.js') `
    -WorkingDirectory $serverRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeRoot 'server.out.log') `
    -RedirectStandardError (Join-Path $runtimeRoot 'server.err.log') `
    -PassThru

  $webProcess = Start-Process -FilePath $nodeCommand.Source `
    -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1') `
    -WorkingDirectory $webRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeRoot 'web.out.log') `
    -RedirectStandardError (Join-Path $runtimeRoot 'web.err.log') `
    -PassThru

  @{
    serverPid = $serverProcess.Id
    webPid = $webProcess.Id
    startedAt = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

  if (-not (Wait-HttpEndpoint 'http://127.0.0.1:8787/api/health')) {
    throw "Server startup timed out. See $runtimeRoot\server.err.log"
  }
  if (-not (Wait-HttpEndpoint 'http://127.0.0.1:5173')) {
    throw "Web startup timed out. See $runtimeRoot\web.err.log"
  }

  Write-Host ''
  Write-Host 'ComputeX started successfully.' -ForegroundColor Green
  Write-Host 'Open: http://127.0.0.1:5173'
  Write-Host 'Stop: double-click Stop-ComputeX.cmd.'
  if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5173' }
} catch {
  Stop-StartedProcess $webProcess
  Stop-StartedProcess $serverProcess
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  throw
}
