#!/usr/bin/env bash
# One-command install for the Canvas MCP server.
#   ./setup.sh
# Installs dependencies, builds, then configures Claude Desktop interactively.

set -euo pipefail

cd "$(dirname "$0")"

echo "Canvas MCP — installing"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install Node 18 or newer from https://nodejs.org (or 'brew install node' on macOS), then run this again."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node 18 or newer is required (found $(node -v))."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. It normally ships with Node.js — reinstall Node from https://nodejs.org"
  exit 1
fi

echo "Installing dependencies..."
npm install --ignore-scripts --no-fund --no-audit

echo "Building..."
npm run build

echo
node scripts/configure.mjs
