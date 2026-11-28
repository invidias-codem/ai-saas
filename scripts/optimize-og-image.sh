#!/usr/bin/env bash
#
# One-shot Open Graph image optimizer for Lattice OS.
#
# What it does:
#   1. Creates/uses a local venv (.venv_ogfix) and installs Pillow.
#   2. Optimizes public/og-image.png to the <300KB OG spec:
#        - lossless baseline (optimize=True, metadata stripped, zlib only)
#        - 256-color quantized version with Floyd-Steinberg dithering to
#          protect the gradient/lattice gradients from color banding
#      The quantized+dithered version becomes the live public/og-image.png.
#   3. Also emits an optional public/og-image.webp progressive copy.
#   4. Asserts the live asset is <= 300KB and prints a size report.
#
# Usage:
#   bash scripts/optimize-og-image.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VENV=".venv_ogfix"
python3 -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --quiet --upgrade pip >/dev/null
pip install --quiet Pillow

python3 - <<'PY'
from PIL import Image
import os

src = "public/og-image.png"
assert os.path.exists(src), f"missing {src}"

img = Image.open(src)
# OG images render on opaque surfaces (Slack/iMessage/X); flatten alpha
# so previews are consistent and never show a transparent/black box.
if img.mode in ("RGBA", "LA", "P"):
    img = img.convert("RGB")

# 1) Lossless baseline (comparison artifact only)
img.save("public/og-image-lossless.png", "PNG", optimize=True)

# 2) 256-color quantize + Floyd-Steinberg dither -> live asset
q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                 dither=Image.Dither.FLOYDSTEINBERG)
q.save("public/og-image-palettized.png", "PNG", optimize=True)
q.save("public/og-image.png", "PNG", optimize=True)

# 3) Optional WebP progressive copy
img.save("public/og-image.webp", "WEBP", quality=80, method=6)

print(f"dims={img.size} mode={img.mode}")
print(f"{'file':28s} {'KB':>5}  status")
for n in ("og-image.png", "og-image-lossless.png", "og-image-palettized.png", "og-image.webp"):
    kb = os.path.getsize(f"public/{n}") // 1024
    print(f"{n:28s} {kb:>5}  {'OK (<300KB)' if kb <= 300 else 'OVER LIMIT'}")

assert os.path.getsize("public/og-image.png") <= 300 * 1024, "live OG still over 300KB"
print("OK: public/og-image.png is within the 300KB Open Graph spec")
PY

deactivate
echo "Done. Live asset: public/og-image.png (comparison copies: og-image-lossless.png, og-image-palettized.png)"
