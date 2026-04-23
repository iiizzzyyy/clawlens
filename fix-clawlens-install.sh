#!/bin/bash
# ClawLens Plugin Fix Script
# This script fixes the plugin ID mismatch and Node version issues

set -e

echo "=== ClawLens Plugin Fix Script ==="
echo ""

# Check Node version
NODE_VERSION=$(node --version)
echo "Current Node version: $NODE_VERSION"
echo ""

# Check if nvm is available
if command -v nvm &> /dev/null || [ -s "$HOME/.nvm/nvm.sh" ]; then
    echo "nvm detected. Loading..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Check if Node 18 is installed
    if nvm ls 18 &> /dev/null; then
        echo "Switching to Node 18 for native module compilation..."
        nvm use 18
        NODE_VERSION=$(node --version)
        echo "Now using Node $NODE_VERSION"
    else
        echo "Node 18 not installed. Installing..."
        nvm install 18
        nvm use 18
        NODE_VERSION=$(node --version)
        echo "Now using Node $NODE_VERSION"
    fi
    echo ""
fi

# Step 1: Rebuild the plugin
echo "Step 1: Rebuilding plugin..."
cd /Users/izzy/clawlens
pnpm --filter clawlens build
echo "✓ Plugin rebuilt"
echo ""

# Step 2: Remove old installation
echo "Step 2: Removing old installation..."
rm -rf /Users/izzy/.openclaw/extensions/clawlens
mkdir -p /Users/izzy/.openclaw/extensions/clawlens
echo "✓ Old installation removed"
echo ""

# Step 3: Copy plugin files (without node_modules symlinks)
echo "Step 3: Copying plugin files..."
cp /Users/izzy/clawlens/packages/plugin/openclaw.plugin.json /Users/izzy/.openclaw/extensions/clawlens/
cp -r /Users/izzy/clawlens/packages/plugin/dist /Users/izzy/.openclaw/extensions/clawlens/
cp -r /Users/izzy/clawlens/packages/plugin/fixtures /Users/izzy/.openclaw/extensions/clawlens/
echo "✓ Plugin files copied"
echo ""

# Step 4: Install dependencies fresh (not via pnpm workspace)
echo "Step 4: Installing dependencies with standalone node_modules..."
cd /Users/izzy/.openclaw/extensions/clawlens

# Create a minimal package.json for npm install
cat > package.json << 'EOF'
{
  "name": "clawlens",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "glob": "^10.3.10",
    "yaml": "^2.4.0"
  }
}
EOF

# Use npm (not pnpm) to get a standalone node_modules
npm install --production
echo "✓ Dependencies installed"
echo ""

# Step 5: Verify installation
echo "Step 5: Verifying installation..."
if [ -f "/Users/izzy/.openclaw/extensions/clawlens/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    echo "✓ better-sqlite3 native module compiled"

    # Check which Node version it was compiled for
    echo ""
    echo "Compiled with Node $NODE_VERSION"
    echo ""

    # Warning if not Node 18
    if [[ ! "$NODE_VERSION" =~ ^v18 ]]; then
        echo "⚠️  WARNING: Compiled with $NODE_VERSION but OpenClaw may use Node 18"
        echo "   If you see NODE_MODULE_VERSION errors, run this script with Node 18:"
        echo ""
        echo "   nvm use 18"
        echo "   bash /Users/izzy/clawlens/fix-clawlens-install.sh"
        echo ""
    fi
else
    echo "✗ better-sqlite3 native module NOT found"
fi

echo ""
echo "=== Fix complete! ==="
echo ""
echo "Now restart OpenClaw:"
echo "  openclaw"
echo ""
