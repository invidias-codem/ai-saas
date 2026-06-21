#!/usr/bin/env bash
# install.sh — One-command installer for lattice-cli
# Usage: curl -sL https://lattice.sh/install.sh | bash
#
# Detects OS/arch, downloads the matching binary from GitHub Releases,
# and installs to /usr/local/bin/lattice (or ~/.local/bin if no sudo).
#
# For air-gapped environments: download the binary manually, then:
#   chmod +x lattice && sudo mv lattice /usr/local/bin/

set -euo pipefail

REPO="invidias-codem/ai-saas"
RELEASE_TAG="latest"
BINARY_NAME="lattice"
INSTALL_DIR="/usr/local/bin"
FALLBACK_DIR="$HOME/.local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}▐${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*"; exit 1; }

banner() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  Lattice OS CLI Installer                 ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
  echo ""
}

detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS" in
    linux)  OS="linux" ;;
    darwin) OS="macos" ;;
    *)      fail "Unsupported OS: $OS (supported: linux, macos)" ;;
  esac

  case "$ARCH" in
    x86_64|amd64)   ARCH="amd64" ;;
    aarch64|arm64)  ARCH="arm64" ;;
    *)              fail "Unsupported architecture: $ARCH (supported: amd64, arm64)" ;;
  esac

  ASSET_NAME="lattice-${OS}-${ARCH}"
  info "Platform: ${OS}/${ARCH}"
}

get_download_url() {
  if [ "$RELEASE_TAG" = "latest" ]; then
    API_URL="https://api.github.com/repos/${REPO}/releases/latest"
  else
    API_URL="https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_TAG}"
  fi

  info "Fetching release info from GitHub ..."

  RESPONSE=$(curl -sL "$API_URL")
  DOWNLOAD_URL=$(echo "$RESPONSE" \
    | python3 -c "import sys,json; data=json.load(sys.stdin); assets=[a for a in data.get('assets',[]) if '${ASSET_NAME}' in a['name']]; print(assets[0]['browser_download_url'] if assets else '')" 2>/dev/null)

  if [ -z "$DOWNLOAD_URL" ]; then
    # Fallback: try tag-based direct URL
    TAG=$(echo "$RESPONSE" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('tag_name',''))" 2>/dev/null)
    if [ -z "$TAG" ]; then
      fail "No releases found. Run \`pip install -e scripts/lattice-cli/\` as fallback."
    fi
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
    warn "Using direct URL fallback (no matching asset found)"
  fi
}

download_and_install() {
  TMPDIR=$(mktemp -d)
  trap "rm -rf $TMPDIR" EXIT

  TARGET="$TMPDIR/$BINARY_NAME"
  info "Downloading ${BINARY_NAME} ..."
  curl -#L "$DOWNLOAD_URL" -o "$TARGET" \
    || fail "Download failed: $DOWNLOAD_URL"

  chmod +x "$TARGET"

  # Verify it actually runs
  if ! "$TARGET" --version >/dev/null 2>&1; then
    fail "Downloaded binary failed to execute — wrong platform?"
  fi

  # Choose install directory
  if [ -w "$INSTALL_DIR" ] || command -v sudo >/dev/null 2>&1; then
    INSTALL_PATH="$INSTALL_DIR/$BINARY_NAME"
    if [ -w "$INSTALL_DIR" ]; then
      cp "$TARGET" "$INSTALL_PATH"
    else
      sudo cp "$TARGET" "$INSTALL_PATH"
    fi
  else
    mkdir -p "$FALLBACK_DIR"
    INSTALL_PATH="$FALLBACK_DIR/$BINARY_NAME"
    cp "$TARGET" "$INSTALL_PATH"
    warn "No sudo access — installed to $INSTALL_PATH"
    if ! echo "$PATH" | tr ':' '\n' | grep -q "^${FALLBACK_DIR}$"; then
      echo ""
      warn "$FALLBACK_DIR is not in your PATH."
      echo "    Add this to your shell profile:"
      echo ""
      echo "    export PATH=\"$FALLBACK_DIR:\$PATH\""
      echo ""
    fi
  fi

  ok "Installed to $INSTALL_PATH"
}

verify_install() {
  echo ""
  echo "───────────────────────────────────────────"

  if command -v $BINARY_NAME >/dev/null 2>&1; then
    VERSION=$($BINARY_NAME --version 2>&1 | head -1)
    ok "lattice $VERSION"
  else
    warn "Binary installed but not on PATH. Run: $INSTALL_PATH --version"
  fi

  echo ""
  echo "  Get started:"
  echo "    lattice auth login         # Docker Hub PAT"
  echo "    lattice license activate <key>"
  echo "    lattice deploy start"
  echo "    lattice health check"
  echo ""
}

# Entry point
banner
detect_platform
get_download_url
download_and_install
verify_install
