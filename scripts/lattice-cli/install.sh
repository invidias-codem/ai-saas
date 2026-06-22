#!/usr/bin/env bash
# install.sh — One-command installer for lattice-cli
# Usage: curl -sL https://raw.githubusercontent.com/invidias-codem/ai-saas/main/scripts/lattice-cli/install.sh | bash
#
# Tries a prebuilt binary from GitHub Releases first. If no matching asset exists,
# falls back to a source install: downloads the Python package, creates a small
# venv, installs the dependency (cryptography), and symlinks the wrapper into PATH.

set -euo pipefail

REPO="invidias-codem/ai-saas"
RELEASE_TAG="latest"
BINARY_NAME="lattice"
INSTALL_DIR="/usr/local/bin"
FALLBACK_DIR="$HOME/.local/bin"
SOURCE_INSTALL_DIR="$HOME/.local/share/lattice-cli"
SOURCE_VENV_DIR="$SOURCE_INSTALL_DIR/venv"

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
    if [ -n "$TAG" ]; then
      DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
      warn "Using direct URL fallback (no matching asset found)"
    else
      warn "No releases found — will use Python wrapper fallback"
      DOWNLOAD_URL=""
    fi
  fi
}

install_source_fallback() {
  warn "Installing Python wrapper -> ${SOURCE_INSTALL_DIR}"
  mkdir -p "${SOURCE_INSTALL_DIR}/lattice_cli"

  # Download wrapper + package files
  curl -sL "https://raw.githubusercontent.com/${REPO}/main/scripts/lattice-cli/lattice" \
    -o "${SOURCE_INSTALL_DIR}/lattice" \
    || fail "Failed to download wrapper"
  chmod +x "${SOURCE_INSTALL_DIR}/lattice"

  for name in __init__ main auth backup config crypto_license deploy docker_ops health license preflight upgrade; do
    curl -sL "https://raw.githubusercontent.com/${REPO}/main/scripts/lattice-cli/lattice_cli/${name}.py" \
      -o "${SOURCE_INSTALL_DIR}/lattice_cli/${name}.py" \
      || fail "Failed to download package file: ${name}.py"
  done

  # Create a dedicated venv and install dep
  info "Creating venv at ${SOURCE_VENV_DIR} ..."
  python3 -m venv "${SOURCE_VENV_DIR}" || fail "Failed to create venv"
  "${SOURCE_VENV_DIR}/bin/pip" install --quiet cryptography \
    || fail "Failed to install cryptography in venv"

  # Point wrapper at the venv Python by rewriting shebang + venv path
  python3 - "${SOURCE_INSTALL_DIR}" <<'PY'
import pathlib, sys

install_dir = pathlib.Path(sys.argv[1])
venv_dir = install_dir / 'venv'
wrapper = install_dir / 'lattice'
text = wrapper.read_text()
# Update shebang to venv python
lines = text.splitlines()
for i, line in enumerate(lines):
    if line.startswith('#!'):
        lines[i] = f'#!{venv_dir}/bin/python3'
        break
else:
    lines.insert(0, f'#!{venv_dir}/bin/python3')

# Ensure lattice_cli is discoverable from the source tree
for i, line in enumerate(lines):
    if line.strip().startswith('sys.path.insert'):
        lines[i] = 'sys.path.insert(0, "' + str(install_dir) + '")'
        break
else:
    # Insert before `from lattice_cli.main import main`
    for i, line in enumerate(lines):
        if 'from lattice_cli.main import main' in line:
            lines.insert(i, 'import sys, os')
            lines.insert(i+1, 'sys.path.insert(0, "' + str(install_dir) + '")')
            break

wrapper.write_text('\n'.join(lines) + '\n')
PY

  # Quick smoke test before symlinking
  if ! "${SOURCE_VENV_DIR}/bin/python3" "${SOURCE_INSTALL_DIR}/lattice" --version >/dev/null 2>&1; then
    fail "Wrapper install failed — verify Python 3.10+ and network access"
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
  ok "Runtime venv at ${SOURCE_VENV_DIR}"
}

download_and_install() {
  if [ -z "$DOWNLOAD_URL" ]; then
    info "Skipping binary download — using Python wrapper fallback"
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

  # Verify binary executes; if not, fall back to source installer
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
