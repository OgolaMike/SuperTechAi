[CmdletBinding()]
param(
    [int]$MinimumCpuCores = 4,
    [int]$MinimumRamGb = 8,
    [int]$MinimumFreeDiskGb = 50
)

$ErrorActionPreference = 'Stop'

$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$ramGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$systemDrive = Get-PSDrive -Name $env:SystemDrive.TrimEnd(':')
$freeGb = [math]::Round($systemDrive.Free / 1GB, 1)
$python = Get-Command py -ErrorAction SilentlyContinue
$pythonVersion = $null

if ($python) {
    try {
        $pythonVersion = (& py -3.11 --version 2>&1 | Out-String).Trim()
    } catch {
        $pythonVersion = 'Python 3.11 launcher check failed'
    }
}

$checks = [ordered]@{
    os = $os.Caption
    version = $os.Version
    cpu_cores = [int]$cpu
    ram_gb = $ramGb
    free_system_disk_gb = $freeGb
    python_311 = $pythonVersion
    meets_cpu = ([int]$cpu -ge $MinimumCpuCores)
    meets_ram = ($ramGb -ge $MinimumRamGb)
    meets_disk = ($freeGb -ge $MinimumFreeDiskGb)
}

$checks | ConvertTo-Json -Depth 4

if (-not $checks.meets_cpu -or -not $checks.meets_ram -or -not $checks.meets_disk) {
    Write-Error 'This host is below the recommended SuperTechAi Trader pilot specification.'
}
