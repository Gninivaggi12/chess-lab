#!/bin/sh
# Installs the pinned dev tools. Run by the harness before sessions start (outside the sandbox).
set -e
npm ci --no-audit --no-fund --loglevel=error
