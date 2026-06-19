import { activeVaultRoot, labRoot } from '../config.js';
import { runProcess } from './process.js';

const OBSIDIAN_VAULT_NAME = 'Roadmap';

export async function reloadObsidian() {
  if (process.platform !== 'win32') {
    throw new Error('Obsidian reload is currently implemented for Windows only.');
  }

  const script = `
$ErrorActionPreference = 'Stop'
$vaultName = '${OBSIDIAN_VAULT_NAME}'
$vaultRoot = '${activeVaultRoot.replace(/'/g, "''")}'
$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Obsidian.exe' })
$exe = $null

if ($processes.Count -gt 0) {
  $exe = ($processes | Where-Object { $_.ExecutablePath } | Select-Object -First 1 -ExpandProperty ExecutablePath)
}

if (!$exe) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\\Obsidian\\Obsidian.exe'),
    (Join-Path $env:PROGRAMFILES 'Obsidian\\Obsidian.exe'),
    (Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Obsidian\\Obsidian.exe')
  )
  $exe = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

if (!$exe) {
  throw 'Obsidian.exe not found.'
}

$ids = @($processes | Select-Object -ExpandProperty ProcessId)
foreach ($id in $ids) {
  try {
    $proc = Get-Process -Id $id -ErrorAction Stop
    [void]$proc.CloseMainWindow()
  } catch {}
}

if ($ids.Count -gt 0) {
  Start-Sleep -Seconds 3
  foreach ($id in $ids) {
    try {
      $proc = Get-Process -Id $id -ErrorAction Stop
      Stop-Process -Id $id -Force
    } catch {}
  }
}

Start-Process -FilePath $exe
Start-Sleep -Seconds 2
Start-Process ('obsidian://open?vault=' + [uri]::EscapeDataString($vaultName))
Write-Host "Reloaded Obsidian for vault $vaultName at $vaultRoot"
`;

  return runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], labRoot);
}
