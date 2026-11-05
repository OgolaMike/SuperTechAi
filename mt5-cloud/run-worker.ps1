[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$WorkerDirectory,
    [Parameter(Mandatory = $true)][string]$WorkerId,
    [Parameter(Mandatory = $true)][string]$BridgeUrl,
    [Parameter(Mandatory = $true)][string]$TerminalPath
)

$ErrorActionPreference = 'Stop'
$python = Join-Path $WorkerDirectory '.venv\Scripts\python.exe'
$worker = Join-Path $WorkerDirectory 'worker.py'

if (-not (Test-Path $python)) { throw 'Worker virtual environment is missing. Run register-worker.ps1 first.' }
if (-not (Test-Path $worker)) { throw 'worker.py is missing from the isolated worker directory.' }
if (-not (Test-Path $TerminalPath)) { throw 'MT5 terminal executable was not found.' }

$env:STAI_BRIDGE_URL = $BridgeUrl
$env:STAI_WORKER_ID = $WorkerId
$env:STAI_MT5_TERMINAL_PATH = $TerminalPath
$env:STAI_LOG_LEVEL = 'INFO'

Set-Location $WorkerDirectory
& $python $worker
exit $LASTEXITCODE
