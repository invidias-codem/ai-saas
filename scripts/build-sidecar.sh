#!/bin/bash
# scripts/build-sidecar.sh

# Detect OS and Architecture to determine the Rust target triple
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [ "$OS" = "darwin" ]; then
  if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-apple-darwin"
  else
    TARGET="x86_64-apple-darwin"
  fi
elif [ "$OS" = "linux" ]; then
  TARGET="x86_64-unknown-linux-gnu"
# (Add Windows target mappings here later)
fi

echo "Building Go sidecar for $TARGET..."

mkdir -p src-tauri/binaries
# Build the Go binary and append the target triple
cd go-harness && go build -o ../src-tauri/binaries/lattice-harness-$TARGET ./cmd/lattice-harness
cd ..

echo "Sidecar built successfully: src-tauri/binaries/lattice-harness-$TARGET"
