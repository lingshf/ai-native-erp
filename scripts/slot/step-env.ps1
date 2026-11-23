# Step environment for slot-run.ps1 (S12 SLOT-02; S11 retrospective action 3, D387 / D407).
# The runner is pwsh 7, so a child inherits pwsh 7's PSModulePath; a Windows PowerShell 5.1 started from a
# step (directly or further down) then cannot load its own built-in modules (D387: the hash cmdlet was
# "not recognized"). Every step, not only powershell.exe ones, gets the value a 5.1 started from Explorer
# sees: the User PSModulePath (when set) in front of the Machine one. A step's own env.PSModulePath wins.

function Get-WindowsPowerShellModulePath {
  $machine = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('PSModulePath', 'User')
  if ($user) { return "$user;$machine" }
  return $machine
}

# The variables to set for one step: PSModulePath first, then the step's env (which may override it).
function Get-StepEnvironment([System.Collections.IDictionary] $StepEnv) {
  $environment = [ordered]@{ PSModulePath = (Get-WindowsPowerShellModulePath) }
  if ($StepEnv) { foreach ($name in $StepEnv.Keys) { $environment[$name] = $StepEnv[$name] } }
  return $environment
}

# Sets the variables in this process (Start-Process children inherit them) and returns the previous
# values, $null for "was not set", for Restore-StepEnvironment.
function Set-StepEnvironment([System.Collections.IDictionary] $Environment) {
  $previous = [ordered]@{}
  foreach ($name in $Environment.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, [string] $Environment[$name], 'Process')
  }
  return $previous
}

function Restore-StepEnvironment([System.Collections.IDictionary] $Previous) {
  foreach ($name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($name, $Previous[$name], 'Process') }
}
