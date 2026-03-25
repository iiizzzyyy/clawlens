#!/usr/bin/env bash
#
# Deploy ClawLens plugin to OpenClaw extensions directory.
#
# Automatically finds Node 22, builds the plugin, copies files,
# installs production deps, and rebuilds native modules for the
# correct ABI. Eliminates the recurring better-sqlite3 version
# mismatch issue.
#
# Usage:
#   pnpm deploy:openclaw
#   # or directly:
#   bash scripts/deploy.sh
#
# Override the extensions directory:
#   OPENCLAW_EXTENSIONS=/path/to/dir pnpm deploy:openclaw
#
set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSIONS_DIR="${OPENCLAW_EXTENSIONS:-$HOME/.openclaw/extensions/clawlens}"
PLUGIN_DIR="$REPO_DIR/packages/plugin"
REQUIRED_MAJOR=22

# --- Find Node 22 ---
find_node22() {
  # 1. Check if current node is already v22
  if command -v node &>/dev/null; then
    local v
    v=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
    if [[ "$v" == "$REQUIRED_MAJOR" ]]; then
      echo "node"
      return
    fi
  fi

  # 2. Homebrew (macOS)
  for p in /opt/homebrew/Cellar/node@22/*/bin/node /usr/local/Cellar/node@22/*/bin/node; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done

  # 3. nvm
  if [[ -d "${NVM_DIR:-$HOME/.nvm}/versions/node" ]]; then
    for p in "${NVM_DIR:-$HOME/.nvm}"/versions/node/v22.*/bin/node; do
      [[ -x "$p" ]] && { echo "$p"; return; }
    done
  fi

  # 4. fnm
  if [[ -d "$HOME/Library/Application Support/fnm/node-versions" ]]; then
    for p in "$HOME/Library/Application Support/fnm/node-versions"/v22.*/installation/bin/node; do
      [[ -x "$p" ]] && { echo "$p"; return; }
    done
  fi

  # 5. volta
  if [[ -d "$HOME/.volta/tools/image/node" ]]; then
    for p in "$HOME/.volta/tools/image/node"/22.*/bin/node; do
      [[ -x "$p" ]] && { echo "$p"; return; }
    done
  fi

  # 6. mise / asdf
  if [[ -d "$HOME/.local/share/mise/installs/node" ]]; then
    for p in "$HOME/.local/share/mise/installs/node"/22.*/bin/node; do
      [[ -x "$p" ]] && { echo "$p"; return; }
    done
  fi

  return 1
}

echo "=== ClawLens Deploy ==="
echo ""

NODE22=$(find_node22) || {
  echo "ERROR: Node 22 not found."
  echo ""
  echo "OpenClaw requires Node 22. Install it with one of:"
  echo "  nvm install 22"
  echo "  brew install node@22"
  echo "  fnm install 22"
  exit 1
}
echo "Node 22: $NODE22 ($($NODE22 --version))"

# --- Build plugin and UI ---
echo ""
echo "Building plugin and UI..."
cd "$REPO_DIR"
pnpm -r build

# --- Deploy to extensions directory ---
echo ""
echo "Deploying to $EXTENSIONS_DIR..."
mkdir -p "$EXTENSIONS_DIR/dist"
cp -r "$PLUGIN_DIR/dist/"* "$EXTENSIONS_DIR/dist/"
cp "$PLUGIN_DIR/package.json" "$EXTENSIONS_DIR/"
cp "$PLUGIN_DIR/openclaw.plugin.json" "$EXTENSIONS_DIR/"

# --- Install production deps with Node 22 ---
echo ""
echo "Installing production dependencies (Node 22)..."

# Find npm that ships with this Node 22
NODE22_DIR="$(dirname "$NODE22")"
NPM22=""
# Check for npm binary next to node
if [[ -x "$NODE22_DIR/npm" ]]; then
  NPM22="$NODE22_DIR/npm"
# Check for npm-cli.js in the lib directory
elif [[ -f "$NODE22_DIR/../lib/node_modules/npm/bin/npm-cli.js" ]]; then
  NPM22="$NODE22_DIR/../lib/node_modules/npm/bin/npm-cli.js"
fi

cd "$EXTENSIONS_DIR"
if [[ -n "$NPM22" ]]; then
  "$NODE22" "$NPM22" install --production 2>&1 | grep -v "^npm warn" || true
else
  echo "Warning: Could not find npm for Node 22, using system npm with explicit node path"
  PATH="$NODE22_DIR:$PATH" npm install --production 2>&1 | grep -v "^npm warn" || true
fi

# --- Rebuild native module with Node 22 ---
echo ""
echo "Rebuilding better-sqlite3 for Node 22 (ABI 127)..."
cd "$EXTENSIONS_DIR/node_modules/better-sqlite3"
PATH="$NODE22_DIR:$PATH" node-gyp rebuild 2>&1 | tail -1

# --- Verify ---
echo ""
echo "Verifying native module..."
"$NODE22" -e "
  const db = require('$EXTENSIONS_DIR/node_modules/better-sqlite3')(':memory:');
  db.close();
  console.log('OK: better-sqlite3 loads correctly under ' + process.version);
"

echo ""
echo "=== Deploy complete ==="
echo "Restart OpenClaw to load the updated plugin."
