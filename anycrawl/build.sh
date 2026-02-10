#!/bin/bash
set -e

# Detect architecture
ARCH=$(uname -m)
echo "🔍 Detected architecture: $ARCH"

# Set build arguments based on architecture
if [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
    echo "🔧 ARM64 detected, skipping Puppeteer in build"
    BUILD_ARGS="--build-arg ENABLE_PUPPETEER=false"
    TAG_SUFFIX="arm64"
elif [[ "$ARCH" == "x86_64" || "$ARCH" == "amd64" ]]; then
    echo "🔧 x86_64 detected, including all engines"
    BUILD_ARGS="--build-arg ENABLE_PUPPETEER=true"
    TAG_SUFFIX="amd64"
else
    echo "⚠️  Unknown architecture $ARCH, using default config (skip Puppeteer)"
    BUILD_ARGS="--build-arg ENABLE_PUPPETEER=false"
    TAG_SUFFIX="unknown"
fi

# Set image tags
IMAGE_TAG=${1:-"anycrawl:latest"}
ARCH_TAG="anycrawl:${TAG_SUFFIX}"

echo "🏗️  Starting image build..."
echo "   Image tags: $IMAGE_TAG, $ARCH_TAG"
echo "   Build args: $BUILD_ARGS"

# Build image
eval "docker build $BUILD_ARGS -t $IMAGE_TAG -t $ARCH_TAG ."

echo "✅ Build completed!"
echo "📋 Image info:"
docker images | grep anycrawl | head -5

echo "🚀 Usage:"
echo "   docker run -d --name anycrawl -p 8080:8080 $IMAGE_TAG"

# Show supported engines
if [[ "$BUILD_ARGS" == *"ENABLE_PUPPETEER=false"* ]]; then
    echo "🔄 Supported engines: Playwright, Cheerio"
    echo "❌ Skipped engines: Puppeteer (architecture incompatible)"
else
    echo "🔄 Supported engines: Playwright, Cheerio, Puppeteer"
fi 