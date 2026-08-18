$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$vercelBootstrap = Join-Path $projectRoot 'scripts\vercel-cli-bootstrap.cjs'
$vercelCommand = Join-Path $env:USERPROFILE 'npm-global\vercel.cmd'

if (-not (Test-Path -LiteralPath $vercelCommand)) {
  throw 'Vercel CLI was not found. Install it with: npm install --global vercel'
}

$env:NODE_OPTIONS = "--require=`"$($vercelBootstrap -replace '\\', '/')`""

Push-Location $projectRoot
try {
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

  git add --all
  if ($LASTEXITCODE -ne 0) { throw 'Git staging failed.' }

  $stagedFiles = @(git diff --cached --name-only)
  $blockedFiles = @($stagedFiles | Where-Object {
    ($_ -match '(^|/)(\.runtime/|node_modules/|dist/)|\.db(-shm|-wal)?$|\.log$') -or
    ($_ -match '(^|/)\.env($|\.)' -and $_ -ne '.env.example')
  })
  if ($blockedFiles.Count -gt 0) {
    throw "Publishing stopped because protected files were staged: $($blockedFiles -join ', ')"
  }

  if ($stagedFiles.Count -gt 0) {
    git commit -m "Release ComputeX $((Get-Date).ToString('yyyy-MM-dd HH:mm'))"
    if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
  }

  git push
  if ($LASTEXITCODE -ne 0) { throw 'GitHub push failed.' }

  & $vercelCommand --prod --yes
  if ($LASTEXITCODE -ne 0) { throw 'Vercel deployment failed.' }
} finally {
  Pop-Location
}
