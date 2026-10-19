#!/bin/sh
# Installs the pinned dev tools. The harness runs this outside the sandbox before sessions
# start; a worker's own run inside the sandbox then finds them installed and needs no network.
set -e
if cmp -s package-lock.json node_modules/.installed-lock 2>/dev/null; then
  exit 0
fi
npm ci --no-audit --no-fund --loglevel=error
cp package-lock.json node_modules/.installed-lock
