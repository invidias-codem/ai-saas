#!/bin/bash

echo "🧹 Starting Safe Disk Cleanup..."
echo "Current Space:"
df -h . | tail -n 1

# 1. Clean Next.js Build Artifacts (Safe, just re-builds)
# This is often 1GB+ per project
if [ -d ".next" ]; then
    echo "🗑️  Removing .next build folder..."
    rm -rf .next
fi

if [ -d ".swc" ]; then
    echo "🗑️  Removing .swc cache..."
    rm -rf .swc
fi

# 2. Clean NPM Cache
# This is the global cache
echo "🗑️  Cleaning NPM cache..."
npm cache clean --force

# 3. Clean Git Garbage
# Optimizes the local repository storage
echo "ww🗑️  Optimizing Git objects..."
git gc --prune=now

# 4. Clean Homebrew (if installed)
if command -v brew &> /dev/null; then
    echo "🗑️  Cleaning Homebrew cache..."
    brew cleanup
fi

# 5. Clean Google Cloud SDK Logs
# These can accumulate over time
if [ -d "$HOME/.config/gcloud/logs" ]; then
    echo "🗑️  Cleaning gcloud logs..."
    rm -rf "$HOME/.config/gcloud/logs"
fi

echo "========================================"
echo "✅ Cleanup Complete!"
echo "New Space:"
df -h . | tail -n 1
