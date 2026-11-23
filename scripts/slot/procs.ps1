# Exclusive-slot counted-process logic, dot-sourced by slot-run.ps1 and selftest.ps1 (D311, D314).
# Implements rule version R2 of design/roadmap.md §5 "进程采样规则": R1 (D338, D341) plus the SR-X1 carry-over of
# D411 (Get-UnreadableOwner). R1 is the D316 kit's procs.ps1 (gist
# lingshf/c437f3d99887d0214ebd05ae9d741cc5 @ 4e00af7, LF SHA-256 906A4B70…90A6F8) including the launcher branch
# ratified by D320, branch for branch and in the same order. Every decision exit carries its rule id (SR-R1, SR-C1–C3,
# SR-X1–X5) in a trailing "# exit SR-…" comment; "kit :N" names the line of the D316 file. check-manifest.mjs checks
# the ids against the roadmap table. Changing any rule needs a decision number and a roadmap edit (R2…) first.
$script:SlotRuleVersion = 'R2'
# Candidate (D314): every process outside this runner's tree whose image name is in $names (node, cmd, any Chrome
# or Edge, vite, esbuild, biome, tsc, npm, npx), whatever its command line; there is no command-line prefilter.
# A candidate whose command line cannot be read is counted as unknown ownership, without the ownership walk.
# D315: an unknown-ownership system browser (and its cmd.exe helpers) may be excluded; see Get-SystemExclusion.
# Ownership (D311): walk the process, then its parents (a parent must not be younger than its child). At each
# level the evidence is the executable path, the working directory (read from the process's PEB) and absolute
# paths on the command line; cmd.exe command lines (its /c argument) are never used to exclude. Each path is
# mapped to the git repository containing it (.git file or directory; repository identity = git common dir, or a
# config naming ai-native-erp). The nearest level with any repository evidence decides: any ai-native-erp path ->
# counted; only other-repository paths -> excluded, with the reason logged; no evidence anywhere -> counted.
$names = '(?i)^(node|cmd|chrome|chrome-headless-shell|msedge|vite|esbuild|biome|tsc|npx|npm)(\.exe)?$'
if (-not ('Gate01Cwd' -as [type])) {
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Gate01Cwd {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr h, out bool wow);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, ref Pbi info, int len, out int ret);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  [StructLayout(LayoutKind.Sequential)] struct Pbi { public IntPtr Exit; public IntPtr Peb; public IntPtr Affinity; public IntPtr Priority; public IntPtr Pid; public IntPtr Parent; }
  static byte[] Read(IntPtr h, IntPtr a, int n) { var b = new byte[n]; IntPtr r; return ReadProcessMemory(h, a, b, (IntPtr)n, out r) && (long)r == n ? b : null; }
  // Current directory of a 64-bit process, or null when it cannot be read.
  public static string Get(int pid) {
    if (IntPtr.Size != 8) return null;
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) h = OpenProcess(0x1010, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      bool wow; if (IsWow64Process(h, out wow) && wow) return null;
      var pbi = new Pbi(); int ret;
      if (NtQueryInformationProcess(h, 0, ref pbi, Marshal.SizeOf(pbi), out ret) != 0) return null;
      var pp = Read(h, pbi.Peb + 0x20, 8); if (pp == null) return null;
      var us = Read(h, (IntPtr)BitConverter.ToInt64(pp, 0) + 0x38, 16); if (us == null) return null;
      int len = BitConverter.ToUInt16(us, 0); if (len == 0 || len > 8192) return null;
      var s = Read(h, (IntPtr)BitConverter.ToInt64(us, 8), len);
      return s == null ? null : System.Text.Encoding.Unicode.GetString(s);
    } finally { CloseHandle(h); }
  }
}
'@
}
$script:erpCommon = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --path-format=absolute --git-common-dir)).TrimEnd('\', '/')
$script:pathOwner = @{}
function Get-CmdPaths([string] $cl) {
  foreach ($m in [regex]::Matches($cl, '"([^"]*)"|(\S+)')) {
    $v = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }
    $d = [regex]::Match($v, '[A-Za-z]:[\\/]')
    if ($d.Success) { try { [IO.Path]::GetFullPath($v.Substring($d.Index).TrimEnd(',', ';')) } catch { } }
  }
}
function Test-ErpRepo([string] $root, [string] $dotGit) {
  $common = $dotGit
  if (-not (Test-Path -LiteralPath $dotGit -PathType Container)) {
    $gd = [IO.Path]::GetFullPath(((Get-Content -LiteralPath $dotGit -TotalCount 1) -replace '^gitdir:\s*', '').Trim(), $root)
    $cd = Join-Path $gd 'commondir'
    $common = if (Test-Path -LiteralPath $cd) { [IO.Path]::GetFullPath((Get-Content -LiteralPath $cd -TotalCount 1).Trim(), $gd) } else { $gd }
  }
  if ($common.TrimEnd('\', '/') -ieq $script:erpCommon) { return $true }
  $cfg = Join-Path $common 'config'
  return (Test-Path -LiteralPath $cfg) -and ((Get-Content -LiteralPath $cfg -Raw) -match '(?i)ai-native-erp')
}
# "erp" | "foreign:<repo root>" | "unknown" (no enclosing repository, or unreadable).
function Get-PathOwner([string] $path) {
  if ($script:pathOwner.ContainsKey($path)) { return $script:pathOwner[$path] }
  $r = 'unknown'; $d = $path
  try {
    while ($d -and [IO.Path]::GetPathRoot($d) -ne $d) {
      $g = [IO.Path]::Combine($d, '.git')
      if ([IO.Directory]::Exists($g) -or [IO.File]::Exists($g)) { $r = if (Test-ErpRepo $d $g) { 'erp' } else { "foreign:$d" }; break }
      $d = [IO.Path]::GetDirectoryName($d)
    }
  } catch { $r = 'unknown' }
  $script:pathOwner[$path] = $r
  return $r
}
function Get-Owner($p, [hashtable] $byId) {
  $node = $p; $depth = 0; $seen = @{}
  while ($node -and $depth -lt 32 -and -not $seen.ContainsKey([int]$node.ProcessId)) {
    $seen[[int]$node.ProcessId] = $true
    $ev = [System.Collections.Generic.List[object]]::new()
    if ($node.ExecutablePath) { $ev.Add(@('exe', $node.ExecutablePath)) }
    $cwd = [Gate01Cwd]::Get([int]$node.ProcessId); if ($cwd) { $ev.Add(@('cwd', $cwd)) }
    $isCmd = $node.Name -match '(?i)^cmd(\.exe)?$'
    if ($node.CommandLine) { foreach ($x in Get-CmdPaths $node.CommandLine) { $ev.Add(@($(if ($isCmd) { 'cmd-arg' } else { 'cmdline' }), $x)) } }
    $erp = $null; $foreign = $null
    foreach ($e in $ev) {
      $o = Get-PathOwner $e[1]
      if ($o -eq 'erp') { if (-not $erp) { $erp = "$($e[0]) $($e[1])" } }
      elseif ($o.StartsWith('foreign:') -and $e[0] -ne 'cmd-arg' -and -not $foreign) { $foreign = "$($e[0]) $($e[1]) in repo $($o.Substring(8))" }
    }
    $who = if ($depth -eq 0) { 'self' } else { "ancestor pid=$($node.ProcessId) $($node.Name) depth=$depth" }
    if ($erp) { return @{ Kind = 'erp'; Rule = 'SR-C2'; Reason = "${who}: ai-native-erp $erp" } }  # exit SR-C2 (kit :94)
    if ($foreign) { return @{ Kind = 'foreign'; Rule = 'SR-X1'; Reason = "${who}: $foreign" } }  # exit SR-X1 (kit :95)
    $parent = $byId[[int]$node.ParentProcessId]
    if (-not $parent -or ($parent.CreationDate -and $node.CreationDate -and $parent.CreationDate -gt $node.CreationDate)) { break }
    $node = $parent; $depth++
  }
  return @{ Kind = 'unknown'; Rule = 'SR-C3'; Reason = "no repository evidence in process or $depth ancestor(s)" }  # exit SR-C3 (kit :100)
}
# D315 system-browser exclusion, for a candidate of unknown ownership only. All of:
#   (a) executable under C:\Program Files*, C:\Windows or the user's AppData\Local\Programs;
#   (b) no repository evidence (executable, cwd, any command-line path) in the process or any ancestor;
#   (c) command line readable and naming no ai-native-erp path;
#   (d) no automation markers (remote debugging, headless, enable-automation, ms-playwright, a Temp or
#       playwright --user-data-dir).
# Only browsers (msedge, chrome) qualify on their own. A cmd.exe qualifies only if it also meets (a)-(d) and its
# parent is an excluded browser, or a non-candidate launcher under Program Files* / AppData\Local\Programs that
# meets (c)-(d), or (D316) its parent has exited, its cwd is readable and outside any repository, and it has at least
# one live child (conhost aside), every one a non-candidate under Program Files* / AppData\Local\Programs meeting (c)-(d).
# Returns @{ Rule = SR-X2 | SR-X3 | SR-X4 | SR-X5; Reason = the conditions met }, or $null (counted).
$script:automation = '(?i)--remote-debugging-(port|pipe)|--headless|--enable-automation|ms-playwright'
function Test-SystemExe([string] $exe) {
  if (-not $exe) { return $null }
  if ($exe -match '^(?i)C:\\Program Files( \(x86\))?\\') { return 'Program Files' }
  if ($exe -match '^(?i)C:\\Windows\\') { return 'C:\Windows' }
  if ($exe.StartsWith((Join-Path $env:LOCALAPPDATA 'Programs') + '\', [StringComparison]::OrdinalIgnoreCase)) { return 'AppData\Local\Programs' }
  return $null
}
function Test-CleanCmdline([string] $cl) {
  if (-not $cl) { return 'command line unreadable' }
  if ($cl -match '(?i)ai-native-erp') { return 'command line names ai-native-erp' }
  foreach ($x in Get-CmdPaths $cl) { if ((Get-PathOwner $x) -eq 'erp') { return "command line path $x is ai-native-erp" } }
  if ($cl -match $script:automation) { return "automation marker $($Matches[0])" }
  foreach ($m in [regex]::Matches($cl, '(?i)--user-data-dir=("([^"]*)"|(\S+))')) {
    $v = if ($m.Groups[2].Success) { $m.Groups[2].Value } else { $m.Groups[3].Value }
    if ($v -match '(?i)[\\/]Temp([\\/]|$)|playwright') { return "automation marker --user-data-dir=$v" }
  }
  return $null
}
function Test-NoRepoChain($p, [hashtable] $byId) {
  $node = $p; $depth = 0; $seen = @{}
  while ($node -and $depth -lt 32 -and -not $seen.ContainsKey([int]$node.ProcessId)) {
    $seen[[int]$node.ProcessId] = $true
    $paths = @($node.ExecutablePath, [Gate01Cwd]::Get([int]$node.ProcessId)) + @(if ($node.CommandLine) { Get-CmdPaths $node.CommandLine })
    foreach ($x in $paths) { if ($x -and (Get-PathOwner $x) -ne 'unknown') { return "repository evidence at pid=$($node.ProcessId) ($x)" } }
    $parent = $byId[[int]$node.ParentProcessId]
    if (-not $parent -or ($parent.CreationDate -and $node.CreationDate -and $parent.CreationDate -gt $node.CreationDate)) { break }
    $node = $parent; $depth++
  }
  return $null
}
function Get-SystemExclusion($p, [hashtable] $byId) {
  $isBrowser = $p.Name -match '(?i)^(msedge|chrome)\.exe$'
  $isCmd = $p.Name -match '(?i)^cmd\.exe$'
  if (-not ($isBrowser -or $isCmd)) { return $null }
  $where = Test-SystemExe $p.ExecutablePath; if (-not $where) { return $null }
  if (Test-CleanCmdline $p.CommandLine) { return $null }
  if (Test-NoRepoChain $p $byId) { return $null }
  $rules = "D315 (a) exe under $where; (b) no repository evidence in process or ancestors; (c) command line readable, no ai-native-erp path; (d) no automation marker"
  if ($isBrowser) { return @{ Rule = 'SR-X2'; Reason = $rules } }  # exit SR-X2 (kit :151)
  $parent = $byId[[int]$p.ParentProcessId]
  if (-not $parent -or ($parent.CreationDate -and $p.CreationDate -and $parent.CreationDate -gt $p.CreationDate)) {
    # D316 orphan cmd.exe (parent exited): judged afresh every sample from its live children, never from /c.
    $cwd = [Gate01Cwd]::Get([int]$p.ProcessId)
    if (-not $cwd -or (Get-PathOwner $cwd) -ne 'unknown') { return $null }
    $kids = @($byId.Values | Where-Object { [int]$_.ParentProcessId -eq [int]$p.ProcessId -and $_.Name -ne 'conhost.exe' -and -not ($_.CreationDate -and $p.CreationDate -and $_.CreationDate -lt $p.CreationDate) })
    if ($kids.Count -eq 0) { return $null }
    foreach ($k in $kids) {
      if ($k.Name -match $names) { return $null }
      $kw = Test-SystemExe $k.ExecutablePath
      if (-not $kw -or $kw -eq 'C:\Windows' -or (Test-CleanCmdline $k.CommandLine)) { return $null }
    }
    return @{ Rule = 'SR-X5'; Reason = "$rules; D316 orphan cmd.exe (parent pid=$($p.ParentProcessId) gone), cwd $cwd without repository, live children: $(($kids | ForEach-Object { "pid=$($_.ProcessId) $($_.ExecutablePath)" }) -join ', ')" }  # exit SR-X5 (kit :165)
  }
  if ($parent.Name -match $names) {
    if ($parent.Name -match '(?i)^(msedge|chrome)\.exe$' -and (Get-SystemExclusion $parent $byId)) { return @{ Rule = 'SR-X3'; Reason = "$rules; parent pid=$($parent.ProcessId) $($parent.Name) is an excluded system browser" } }  # exit SR-X3 (kit :168)
    return $null
  }
  $pw = Test-SystemExe $parent.ExecutablePath
  if ($pw -and $pw -ne 'C:\Windows' -and -not (Test-CleanCmdline $parent.CommandLine)) { return @{ Rule = 'SR-X4'; Reason = "$rules; parent pid=$($parent.ProcessId) $($parent.Name) is a system launcher under $pw meeting (c)-(d)" } }  # exit SR-X4 (kit :171–172, D320)
  return $null
}
# D411: SR-X1 verdicts made earlier in this run, pid -> @{ Created; Reason }. A process whose command line becomes
# unreadable (typically while it exits) keeps its SR-X1 verdict only when its creation time is readable and equal to
# the recorded one; otherwise the PID may have been reused and it is counted (SR-C3) as before.
$script:foreignSeen = @{}
function Save-ForeignVerdict($p, [string] $reason) {
  if ($p.CreationDate) { $script:foreignSeen[[int]$p.ProcessId] = @{ Created = $p.CreationDate; Reason = $reason } }
}
function Get-UnreadableOwner($p) {
  $seen = $script:foreignSeen[[int]$p.ProcessId]
  if ($seen -and $p.CreationDate -and $seen.Created -eq $p.CreationDate) {
    return @{ Kind = 'foreign'; Rule = 'SR-X1'; Reason = "command line unreadable, judged foreign earlier in this run with the same creation time (D411): $($seen.Reason)" }  # exit SR-X1 (D411)
  }
  return @{ Kind = 'unknown'; Rule = 'SR-C3'; Reason = 'command line unreadable' }  # exit SR-C3 (kit :190)
}
# Counted processes; the excluded ones (SR-X1–X5) are left in $script:lastExcluded. Every judged candidate gets
# Owner ("<rule> <kind>: <reason>") and Rule. Processes of this runner's tree (SR-R1) are neither counted nor
# excluded; how many were in this snapshot is left in $script:lastRunnerTree.
# -All replaces the live process snapshot (self-test only).
function Counted([object[]] $All) {
  $all = if ($All) { $All } else { Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate }
  # Cumulative across samples: a browser whose test worker exits first is reparented away from this tree but stays ours.
  $mine = $script:ever
  do {
    $grew = $false
    foreach ($p in $all) { if ($mine.ContainsKey([int]$p.ParentProcessId) -and -not $mine.ContainsKey([int]$p.ProcessId)) { $mine[[int]$p.ProcessId] = $true; $grew = $true } }  # exit SR-R1 (kit :180–184, cumulative)
  } while ($grew)
  $byId = @{}; foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
  $script:lastExcluded = [System.Collections.Generic.List[object]]::new()
  $script:lastRunnerTree = 0
  $hits = [System.Collections.Generic.List[object]]::new()
  foreach ($p in $all) {
    # kit :189 tested both conditions in one "continue"; split only to count the runner tree.
    if ($mine.ContainsKey([int]$p.ProcessId)) { $script:lastRunnerTree++; continue }  # exit SR-R1 (kit :189)
    if ($p.Name -notmatch $names) { continue }  # exit SR-C1 (kit :189)
    $o = if ($p.CommandLine) { Get-Owner $p $byId } else { Get-UnreadableOwner $p }
    if ($p.CommandLine -and $o.Kind -eq 'foreign') { Save-ForeignVerdict $p $o.Reason }
    $sys = if ($o.Kind -eq 'unknown' -and $p.CommandLine) { Get-SystemExclusion $p $byId }
    $rule = if ($sys) { $sys.Rule } else { $o.Rule }
    $owner = if ($sys) { "$rule system: $($sys.Reason)" } else { "$rule $($o.Kind): $($o.Reason)" }
    $p | Add-Member -NotePropertyName Owner -NotePropertyValue $owner -Force
    $p | Add-Member -NotePropertyName Rule -NotePropertyValue $rule -Force
    if ($o.Kind -eq 'foreign' -or $sys) { $script:lastExcluded.Add($p) } else { $hits.Add($p) }  # sink: SR-X1 SR-X2 SR-X3 SR-X4 SR-X5 excluded / SR-C2 SR-C3 counted, verdicts made above (kit :194)
  }
  return , $hits.ToArray()
}
