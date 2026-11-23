# I1 probe (S12 SLOT-02): run by selftest.ps1 under powershell.exe (5.1) to show whether the inherited
# PSModulePath lets 5.1 load its built-in Microsoft.PowerShell.Utility module. It deliberately calls
# Get-FileHash, the cmdlet D387 found missing; this is the only such call allowed in scripts/slot (D408).
# Prints the SHA-256 of -Path; any error ends it with a non-zero exit code.
param([Parameter(Mandatory)] [string] $Path)
$ErrorActionPreference = 'Stop'
(Get-FileHash -Algorithm SHA256 -ErrorAction Stop -LiteralPath $Path).Hash
