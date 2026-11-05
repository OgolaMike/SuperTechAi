[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9_-]{2,40}$')][string]$MemberKey,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string]$WorkerId,
    [Parameter(Mandatory = $true)][ValidatePattern('^https://[^/]+$')][string]$BridgeUrl,
    [Parameter(Mandatory = $true)][string]$TerminalPath
)

$ErrorActionPreference = 'Stop'

if (-not ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT)) {
    throw 'This installer must run on Windows Server.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'mt5-worker'
if (-not (Test-Path (Join-Path $source 'worker.py'))) {
    throw 'Run this script from a complete SuperTech AI repository checkout.'
}
if (-not (Test-Path $TerminalPath)) {
    throw 'Install the broker MT5 terminal first and provide its terminal64.exe path.'
}

$base = 'C:\SuperTechAI\Accounts'
$workerDirectory = Join-Path $base $MemberKey
$taskName = "SuperTechAiTrader-$MemberKey"
$runScript = Join-Path $PSScriptRoot 'run-worker.ps1'

New-Item -ItemType Directory -Path $base -Force | Out-Null
if (Test-Path $workerDirectory) {
    throw "Worker directory already exists: $workerDirectory. Use a new MemberKey or inspect the existing account before changing it."
}
Copy-Item -Path (Join-Path $source '*') -Destination $workerDirectory -Recurse -Force

$launcher = Get-Command py -ErrorAction SilentlyContinue
if (-not $launcher) { throw 'Python launcher not found. Install Python 3.11 x64 first.' }
& py -3.11 -m venv (Join-Path $workerDirectory '.venv')
if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.11 virtual environment.' }

$python = Join-Path $workerDirectory '.venv\Scripts\python.exe'
& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not update pip.' }
& $python -m pip install -r (Join-Path $workerDirectory 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install MT5 worker dependencies.' }

$env:STAI_WORKER_ID = $WorkerId
Write-Host ''
Write-Host 'Enter the one-time worker token from the SuperTech AI pairing screen.'
Write-Host 'Input is hidden. The token is stored in this Windows user credential vault.'
Push-Location $workerDirectory
try {
    & $python (Join-Path $workerDirectory 'provision_token.py')
    if ($LASTEXITCODE -ne 0) { throw 'Worker token provisioning failed.' }
} finally {
    Pop-Location
}

$actionArgs = '-NoProfile -ExecutionPolicy RemoteSigned -File "' + $runScript + '" -WorkerDirectory "' + $workerDirectory + '" -WorkerId "' + $WorkerId + '" -BridgeUrl "' + $BridgeUrl + '" -TerminalPath "' + $TerminalPath + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'SuperTechAi Trader MT5 bridge worker for one isolated member account.' -Force | Out-Null

Write-Host ''
Write-Host "Registered scheduled task: $taskName"
Write-Host 'Next: sign into the matching MT5 terminal using the member account, then start the task:'
Write-Host "Start-ScheduledTask -TaskName '$taskName'"
Write-Host 'The task runs in the current Windows user session. After a VPS reboot, sign in and confirm the terminal and worker are running.'
