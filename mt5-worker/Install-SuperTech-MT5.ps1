#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$WorkerDir = $PSScriptRoot
Set-Location $WorkerDir

Write-Host "SuperTech AI MT5 Worker setup" -ForegroundColor Cyan
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw "Python Launcher not found. Install Python 3.11 (64-bit), then rerun this setup."
}
& py -3.11 --version
if ($LASTEXITCODE -ne 0) { throw "Python 3.11 was not found. Install Python 3.11 (64-bit)." }

if (-not (Test-Path ".venv")) { & py -3.11 -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Could not install worker dependencies." }

$ProjectUrl = Read-Host "Supabase project URL shown in SuperTech AI setup"
if ($ProjectUrl -notmatch '^https://[a-z0-9]+\.supabase\.co$') { throw "Invalid Supabase project URL." }
$WorkerId = Read-Host "Worker ID shown by SuperTech AI after pairing"
if ([string]::IsNullOrWhiteSpace($WorkerId)) { throw "Worker ID is required." }
$env:STAI_BRIDGE_URL = $ProjectUrl
$env:STAI_WORKER_ID = $WorkerId
& .\.venv\Scripts\python.exe .\provision_token.py
if ($LASTEXITCODE -ne 0) { throw "Secure token provisioning failed." }

$launcher = @(
  '$env:STAI_BRIDGE_URL = "' + $ProjectUrl + '"',
  '$env:STAI_WORKER_ID = "' + $WorkerId + '"',
  'Set-Location "' + $WorkerDir + '"',
  '& ".\.venv\Scripts\python.exe" ".\worker.py"'
)
$launcher | Set-Content -Encoding UTF8 (Join-Path $WorkerDir "Start-SuperTech-MT5.ps1")
Write-Host "Setup complete. Start Start-SuperTech-MT5.ps1 while MT5 is open and logged in." -ForegroundColor Green
