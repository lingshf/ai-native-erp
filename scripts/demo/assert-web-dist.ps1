# Demo tool (RUNMAIN-01): fail fast when an app worktree has no fresh web build.
# The server serves packages/web/dist; without it a Demo run-main only fails ~30 s later with "not ready" (D481).
# Same rule as scripts/slot/slot-run.ps1:154-162 and Demo template item 12: dist/index.html must be strictly
# newer than the HEAD commit time (equal counts as stale). Prints one line starting with "web-dist:".
#   exit 0  web-dist: ok            index.html is newer than the HEAD commit
#   exit 2  web-dist: undetermined  Root missing, not a git worktree, git not found, or commit time unparsable
#   exit 3  web-dist: missing       no packages/web/dist/index.html
#   exit 4  web-dist: stale         index.html is not newer than the HEAD commit
# Usage (from a run-main, before migrate):
#   & scripts/demo/assert-web-dist.ps1 -Root (Get-Location).Path; if ($LASTEXITCODE) { throw "web dist check exit $LASTEXITCODE" }
# Compatible with powershell.exe 5.1 and pwsh 7 (Demo template item 13).
param([string]$Root = (Get-Location).Path)

$ExitOk = 0
$ExitUndetermined = 2
$ExitMissing = 3
$ExitStale = 4
$FixHint = 'run "npm run build" in the worktree root (D481)'

function Write-Result([int]$Code, [string]$Line) {
  Write-Output "web-dist: $Line"
  exit $Code
}

function Format-Utc([DateTime]$Time) { $Time.ToUniversalTime().ToString('o') }

# Returns the HEAD commit time (UTC) of $Dir, or throws with the reason it cannot be determined.
function Get-HeadCommitTime([string]$Dir) {
  if (-not (Get-Command git -CommandType Application -ErrorAction SilentlyContinue)) { throw 'git not found on PATH' }
  $inside = git -C $Dir rev-parse --is-inside-work-tree 2>$null
  if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') { throw "not a git worktree: $Dir" }
  $text = git -C $Dir log -1 --format=%cI HEAD 2>$null
  $parsed = [DateTimeOffset]::MinValue
  $styles = [Globalization.DateTimeStyles]::None
  $culture = [Globalization.CultureInfo]::InvariantCulture
  if ($LASTEXITCODE -ne 0 -or -not [DateTimeOffset]::TryParse("$text", $culture, $styles, [ref]$parsed)) {
    throw "cannot parse HEAD commit time: '$text'"
  }
  $parsed.UtcDateTime
}

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  Write-Result $ExitUndetermined "undetermined (Root does not exist: $Root)"
}
$rootPath = (Get-Item -LiteralPath $Root).FullName
try { $commitTime = Get-HeadCommitTime $rootPath }
catch { Write-Result $ExitUndetermined "undetermined ($($_.Exception.Message))" }

$index = Join-Path $rootPath 'packages\web\dist\index.html'
if (-not (Test-Path -LiteralPath $index -PathType Leaf)) {
  Write-Result $ExitMissing "missing $index; $FixHint"
}
$distTime = (Get-Item -LiteralPath $index).LastWriteTimeUtc
$times = "dist-index=$(Format-Utc $distTime) head-commit=$(Format-Utc $commitTime)"
if (-not ($distTime -gt $commitTime)) {
  Write-Result $ExitStale "stale $index $times (not newer than HEAD commit); $FixHint"
}
Write-Result $ExitOk "ok $index $times"
