#!/usr/bin/env bash
# Download this script, inspect it, then run with a release tag and source commit.
set -euo pipefail
umask 077
export GH_HOST=github.com
REPO='invidias-codem/ai-saas'
WORKFLOW="$REPO/.github/workflows/build-lattice-cli.yml"
TAG="${1:-}"
SOURCE_COMMIT="${2:-}"
fail() { echo "Install refused: $*" >&2; exit 1; }
[[ "$TAG" =~ ^cli-v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$ ]] || fail 'Usage: bash install.sh cli-v<VERSION> <40-character source commit>'
[[ "$SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]] || fail 'A pinned source commit is required.'
command -v gh >/dev/null || fail 'Install the GitHub CLI (gh) for provenance verification.'
case "$(uname -s)" in Linux) OS=linux;; Darwin) OS=macos;; *) fail 'Use install.ps1 on Windows.';; esac
case "$(uname -m)" in x86_64|amd64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; *) fail 'Unsupported processor.';; esac
ASSET="lattice-$OS-$ARCH"
INSTALL_DIR="${LATTICE_INSTALL_DIR:-$HOME/.local/bin}"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
[[ "$(gh release view "$TAG" --repo "$REPO" --json isDraft --jq '.isDraft')" == false ]] || fail 'Release is not published.'
gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --pattern SHA256SUMS --dir "$TEMP_DIR"
EXPECTED=$(awk -v name="$ASSET" '$2 == name { print $1 }' "$TEMP_DIR/SHA256SUMS")
[[ "$EXPECTED" =~ ^[a-f0-9]{64}$ ]] || fail 'Missing or ambiguous checksum.'
if command -v sha256sum >/dev/null; then ACTUAL=$(sha256sum "$TEMP_DIR/$ASSET"); else ACTUAL=$(shasum -a 256 "$TEMP_DIR/$ASSET"); fi
[[ "${ACTUAL%% *}" == "$EXPECTED" ]] || fail 'Checksum mismatch.'
gh attestation verify "$TEMP_DIR/$ASSET" --repo "$REPO" --signer-workflow "$WORKFLOW" --source-ref refs/heads/main --source-digest "$SOURCE_COMMIT"
# First execution happens only after both integrity and provenance verification.
chmod 700 "$TEMP_DIR/$ASSET"
[[ "$("$TEMP_DIR/$ASSET" --version)" == "lattice ${TAG#cli-v}" ]] || fail 'Version mismatch.'
mkdir -p "$INSTALL_DIR"
[[ ! -L "$INSTALL_DIR/lattice" ]] || fail 'Remove the existing lattice symlink before installing.'
STAGED=$(mktemp "$INSTALL_DIR/.lattice.XXXXXX")
trap 'rm -rf "$TEMP_DIR"; rm -f "$STAGED"' EXIT
cp "$TEMP_DIR/$ASSET" "$STAGED"
chmod 755 "$STAGED"
mv -f "$STAGED" "$INSTALL_DIR/lattice"
echo "Installed $TAG to $INSTALL_DIR/lattice"
echo "Add $INSTALL_DIR to PATH if needed, then run lattice doctor --offline --json."
