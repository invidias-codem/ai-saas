#!/bin/bash
# Safe cleanup script for Next.js project
# Removes build artifacts and caches to free up disk space

echo "🧹 Starting safe cleanup..."
echo ""

# Function to safely remove directory
safe_remove() {
    if [ -d "$1" ]; then
        SIZE=$(du -sh "$1" 2>/dev/null | cut -f1)
        echo "Removing $1 ($SIZE)..."
        rm -rf "$1"
        echo "✓ Removed $1"
    else
        echo "⊘ $1 not found, skipping"
    fi
}

# Function to safely remove file
safe_remove_file() {
    if [ -f "$1" ]; then
        SIZE=$(du -sh "$1" 2>/dev/null | cut -f1)
        echo "Removing $1 ($SIZE)..."
        rm -f "$1"
        echo "✓ Removed $1"
    else
        echo "⊘ $1 not found, skipping"
    fi
}

echo "📦 Cleaning Next.js build artifacts..."
safe_remove ".next"

echo ""
echo "🗑️  Cleaning TypeScript build info..."
safe_remove_file "tsconfig.tsbuildinfo"

echo ""
echo "🧪 Cleaning test coverage..."
safe_remove "coverage"
safe_remove ".nyc_output"

echo ""
echo "📝 Cleaning logs..."
safe_remove "*.log"
safe_remove "npm-debug.log*"
safe_remove "yarn-debug.log*"
safe_remove "yarn-error.log*"

echo ""
echo "🐍 Cleaning Python caches..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

echo ""
echo "💾 Cleaning OS-specific files..."
find . -name ".DS_Store" -delete 2>/dev/null || true
find . -name "Thumbs.db" -delete 2>/dev/null || true

echo ""
echo "✨ Cleanup complete!"
echo ""
echo "💡 Note: node_modules was NOT removed (use 'npm ci' if you need to rebuild it)"
echo "💡 To rebuild the app, run: npm run dev"
