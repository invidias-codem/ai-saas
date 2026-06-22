#!/usr/bin/env bash
# install.sh — One-command installer for lattice-cli
# Usage: curl -sL https://raw.githubusercontent.com/invidias-codem/ai-saas/main/scripts/lattice-cli/install.sh | bash
#
# Tries to download a prebuilt binary from GitHub Releases. If no matching
# release asset exists (or it fails to execute), falls back to source install
# by downloading the Python wrapper + package files directly.
#
# Air-gapped alternative: copy the whole `lattice_cli/` package and `lattice`
# wrapper to a shared dir, then symlink it into PATH.

set -euo pipefail

REPO="invidias-codem/ai-saas"
RELEASE_TAG="latest"
BINARY_NAME="lattice"
INSTALL_DIR="/usr/local/bin"
FALLBACK_DIR="$HOME/.local/bin"
SOURCE_INSTALL_DIR="$HOME/.local/share/lattice-cli"

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
    TAG=$(echo "$RESPONSE" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('tag_name',''))" 2>/dev/null)
    if [ -z "$TAG" ]; then
      warn "No releases found — will use Python wrapper fallback"
      DOWNLOAD_URL=""
    else
      DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
      warn "Using direct URL fallback (no matching asset found)"
    fi
  fi
}

install_source_fallback() {
  warn "Installing Python wrapper fallback -> ${SOURCE_INSTALL_DIR}"
  mkdir -p "${SOURCE_INSTALL_DIR}"
  mkdir -p "${SOURCE_INSTALL_DIR}/lattice_cli"

  WRAPPER_URL="https://raw.githubusercontent.com/${REPO}/main/scripts/lattice-cli/lattice"
  if ! curl -sL "$WRAPPER_URL" -o "${SOURCE_INSTALL_DIR}/lattice"; then
    fail "Failed to download wrapper: $WRAPPER_URL"
  fi
  chmod +x "${SOURCE_INSTALL_DIR}/lattice"

  for name in __init__ main auth backup config crypto_license deploy docker_ops health license preflight upgrade; do
    curl -sL "https://raw.githubusercontent.com/${REPO}/main/scripts/lattice-cli/lattice_cli/${name}.py" \
      -o "${SOURCE_INSTALL_DIR}/lattice_cli/${name}.py" \
      || fail "Failed to download package file: ${name}.py"
  done

  # Verify the wrapper works before symlinking
  if ! "${SOURCE_INSTALL_DIR}/lattice" --version >/dev/null 2>&1; then
    fail "Wrapper install failed — check Python version and dependencies"
  fi

  mkdir -p "${FALLBACK_DIR}"
  ln -sf "${SOURCE_INSTALL_DIR}/lattice" "${FALLBACK_DIR}/${BINARY_NAME}"
  INSTALL_PATH="${FALLBACK_DIR}/${BINARY_NAME}"
  if ! echo "$PATH" | tr ':' '\n' | grep -q "^${FALLBACK_DIR}$"; then
    echo ""
    warn "${FALLBACK_DIR} is not in your PATH."
    echo "    Add this to your shell profile:"
    echo ""
    echo "    export PATH=\"${FALLBACK_DIR}:\$PATH\""
    echo ""
  fi

  ok "Installed to ${INSTALL_PATH}"
  ok "Source files at ${SOURCE_INSTALL_DIR}"
}

download_and_install() {
  if [ -z "$DOWNLOAD_URL" ]; then
    info "Skipping binary download — source-only mode"
    install_source_fallback
    return
  fi

  TMPDIR=$(mktemp -d)
  trap "rm -rf $TMPDIR" EXIT

  TARGET="$TMPDIR/$BINARY_NAME"
  info "Downloading ${BINARY_NAME} ..."
  curl -#L "$DOWNLOAD_URL" -o "$TARGET" \
    || fail "Download failed: $DOWNLOAD_URL"

  chmod +x "$TARGET"

  # Verify it actually runs; if not, fall back to the Python wrapper
  if ! "$TARGET" --version >/dev/null 2>&1; then
    warn "Binary release not available — falling back to Python wrapper"
    install_source_fallback
    return
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
    warn "lattice installed but not on PATH. Run: $INSTALL_PATH --version"
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
