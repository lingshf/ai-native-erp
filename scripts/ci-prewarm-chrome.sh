#!/usr/bin/env bash
# Read the runner image's Chrome install, its shared libraries and fonts into the page cache.
# Hosted runner disks are hydrated lazily, so the first Chrome launch on a fresh VM can spend
# 10-16s faulting in these files. This only reads files; it never starts Chrome.
# Best effort: whatever happens (error, missing Chrome, SIGTERM from a timeout) the EXIT trap
# writes a marker with status=ok|failed, so a waiter never needs to sit out its full limit.
# Usage: scripts/ci-prewarm-chrome.sh MARKER_FILE
#   marker: status=ok|failed rc=N ms=N files=N bytes=N
set -euo pipefail
marker=${1:?marker file required}
start=$(date +%s%N)
files=0
bytes=0
list=$(mktemp)
finish() {
  local rc=$?
  local status=ok
  [ "$rc" -eq 0 ] || status=failed
  rm -f "$list"
  echo "status=$status rc=$rc ms=$((($(date +%s%N) - start) / 1000000)) files=$files bytes=$bytes" \
    >"$marker.tmp" && mv "$marker.tmp" "$marker"
}
trap finish EXIT
trap 'exit 143' TERM INT
dir=$(dirname "$(readlink -f "$(command -v google-chrome)")")
{
  find "$dir" -type f
  ldd "$dir/chrome" | awk '$2 == "=>" && $3 ~ /^\// { print $3 }' | xargs -r readlink -f
  find /usr/lib/x86_64-linux-gnu/nss /etc/fonts /var/cache/fontconfig /usr/share/fonts \
    -type f 2>/dev/null || true
} | sort -u >"$list"
xargs -d '\n' -r -P 8 -n 32 cat <"$list" >/dev/null
files=$(wc -l <"$list")
bytes=$(xargs -d '\n' -r du -cb <"$list" | tail -1 | cut -f1)