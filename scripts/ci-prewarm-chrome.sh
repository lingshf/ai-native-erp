#!/usr/bin/env bash
# Read the runner image's Chrome install, its shared libraries and fonts into the page cache.
# Hosted runner disks are hydrated lazily, so the first Chrome launch on a fresh VM can spend
# 10-16s faulting in these files. This only reads files; it never starts Chrome.
# Usage: scripts/ci-prewarm-chrome.sh MARKER_FILE  (writes elapsed ms and file/byte counts)
set -euo pipefail
marker=${1:?marker file required}
start=$(date +%s%N)
dir=$(dirname "$(readlink -f "$(command -v google-chrome)")")
list=$(mktemp)
{
  find "$dir" -type f
  ldd "$dir/chrome" | awk '$2 == "=>" && $3 ~ /^\// { print $3 }' | xargs -r readlink -f
  find /usr/lib/x86_64-linux-gnu/nss /etc/fonts /var/cache/fontconfig /usr/share/fonts \
    -type f 2>/dev/null || true
} | sort -u >"$list"
xargs -d '\n' -r -P 8 -n 32 cat <"$list" >/dev/null
files=$(wc -l <"$list")
bytes=$(xargs -d '\n' -r du -cb <"$list" | tail -1 | cut -f1)
rm -f "$list"
echo "ms=$((($(date +%s%N) - start) / 1000000)) files=$files bytes=$bytes" >"$marker.tmp"
mv "$marker.tmp" "$marker"
