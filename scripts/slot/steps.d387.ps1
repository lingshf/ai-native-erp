# I2 steps file (S12 SLOT-02, D387 regression): runs the three browserless v0.11.0 Demo stand-ins under Windows
# PowerShell 5.1 from the repository root, exactly as docs/demo/v0.11.0/README.md section 4B gives them. With the old
# runner a 5.1 step inherited pwsh 7's PSModulePath and could not load its hash cmdlet (D387); slot-run.ps1 now resets
# PSModulePath per step, so all three must exit 0. The Demo scripts are published and are run unchanged.
#   pwsh -File scripts/slot/slot-run.ps1 -OutDir DIR_OUTSIDE_REPO -StepsFile scripts/slot/steps.d387.ps1
# orchestration-stub.ps1 needs port 4201 free; none of the three starts a browser or Vitest.
param([string] $OutDir, [string] $Root, [string] $BaseRoot)
$demoScripts = 'docs\demo\v0.11.0\scripts'
# Order follows the task (S12 I2); each command line is the one in docs/demo/v0.11.0/README.md.
$demoSteps = @(
  'proc05-negatives'    # README.md:76
  'stub-check'          # README.md:70
  'orchestration-stub'  # README.md:82
)
foreach ($name in $demoSteps) {
  @{ name = "d387-$name"; dir = $Root; file = 'powershell.exe'; args = "-NoProfile -File $demoScripts\$name.ps1"; env = @{} }
}
