param()

$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $ScriptRoot 'start-wiki-lab.ps1'
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'Wiki Lab UI.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$shortcut.WorkingDirectory = Split-Path -Parent $ScriptRoot
$shortcut.IconLocation = 'powershell.exe,0'
$shortcut.Description = 'Start Wiki Lab UI and open it in the browser'
$shortcut.Save()

Write-Host "Created shortcut: $ShortcutPath"
