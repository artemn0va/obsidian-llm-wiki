param()

$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LabRoot = Split-Path -Parent $ScriptRoot
$VaultRoot = 'C:\Users\hello\Documents\GitHub\Roadmap'
$Url = 'http://127.0.0.1:48731'
$HealthUrl = "$Url/api/health"
$StateRoot = Join-Path $VaultRoot '.llm-wiki-lab'
$LogRoot = Join-Path $StateRoot 'logs'
$ServerLog = Join-Path $LogRoot 'server.log'
$ServerErr = Join-Path $LogRoot 'server.err.log'

function Test-WikiLabHealth {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

if (Test-WikiLabHealth) {
  Start-Process $Url
  exit 0
}

$webIndex = Join-Path $LabRoot 'dist\web\index.html'
$serverIndex = Join-Path $LabRoot 'dist\server\index.js'

if (!(Test-Path -LiteralPath $webIndex) -or !(Test-Path -LiteralPath $serverIndex)) {
  Push-Location $LabRoot
  try {
    & pnpm.cmd build *> $ServerLog
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm build failed. See $ServerLog"
    }
  } finally {
    Pop-Location
  }
}

$node = Get-Command node.exe -ErrorAction Stop
Start-Process `
  -FilePath $node.Source `
  -ArgumentList @($serverIndex) `
  -WorkingDirectory $LabRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $ServerLog `
  -RedirectStandardError $ServerErr

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-WikiLabHealth) {
    Start-Process $Url
    exit 0
  }
}

throw "Wiki Lab server did not become healthy. See $ServerLog and $ServerErr"
