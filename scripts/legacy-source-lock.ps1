$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$streams = @{}
$names = @('teaching.sqlite', 'erp.sqlite')

function Inventory {
  $result = @()
  foreach ($name in $names) {
    if ([IO.File]::Exists((Join-Path $source "$name-journal"))) {
      throw 'ROLLBACK_JOURNAL'
    }
    foreach ($suffix in @('', '-wal', '-shm')) {
      $key = "$name$suffix"
      $path = Join-Path $source $key
      $exists = [IO.File]::Exists($path)
      if ($exists -ne $streams.ContainsKey($key)) { throw 'SOURCE_CHANGED' }
      if (-not $exists) {
        $result += @{ file = $key; exists = $false }
        continue
      }
      if (([IO.File]::GetAttributes($path) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'SOURCE_CHANGED' }
      $stream = $streams[$key]
      $stream.Position = 0
      $sha = [Security.Cryptography.SHA256]::Create()
      try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
      finally { $sha.Dispose() }
      $result += @{
        file = $key; exists = $true; bytes = $stream.Length
        mtime = [IO.File]::GetLastWriteTimeUtc($path).Ticks.ToString()
        sha256 = $digest
      }
    }
  }
  return ,$result
}

try {
  $config = [Console]::ReadLine() | ConvertFrom-Json
  $source = $config.source
  foreach ($name in $names) {
    if ([IO.File]::Exists((Join-Path $source "$name-journal"))) { throw 'ROLLBACK_JOURNAL' }
    foreach ($suffix in @('', '-wal', '-shm')) {
      $key = "$name$suffix"
      $path = Join-Path $source $key
      if ($suffix -eq '' -or [IO.File]::Exists($path)) {
        if (([IO.File]::GetAttributes($path) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'INVALID_INPUT' }
        $streams[$key] = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
      }
    }
  }
  [Console]::WriteLine('{"ready":true}')
  while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $line | ConvertFrom-Json
    if ($request.action -eq 'close') { break }
    if ($request.action -eq 'capture') {
      $inventory = Inventory
      [Console]::WriteLine((ConvertTo-Json -InputObject $inventory -Depth 5 -Compress))
    } elseif ($request.action -eq 'copy') {
      foreach ($key in $streams.Keys) {
        if ($key.EndsWith('-shm')) { continue }
        $inputStream = $streams[$key]
        $inputStream.Position = 0
        $output = [IO.File]::Open((Join-Path $request.destination $key), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $inputStream.CopyTo($output); $output.Flush($true) }
        finally { $output.Dispose() }
      }
      [Console]::WriteLine('{"copied":true}')
    } else { throw 'INVALID_INPUT' }
  }
} catch {
  $code = 'SOURCE_BUSY'
  if ($_.Exception.Message -in @('ROLLBACK_JOURNAL', 'SOURCE_CHANGED', 'INVALID_INPUT')) {
    $code = $_.Exception.Message
  }
  [Console]::WriteLine(('{ "error": "' + $code + '" }'))
  exit 1
} finally {
  foreach ($stream in $streams.Values) { $stream.Dispose() }
}
