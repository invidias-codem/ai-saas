"""
Build pipeline for lattice-cli standalone binaries.

Uses Nuitka (when available) for native compilation or PyInstaller
as a fallback bundler. Produces a single executable per platform.

Target binaries:
  - lattice-linux-amd64
  - lattice-linux-arm64
  - lattice-macos-amd64
  - lattice-macos-arm64
  - lattice-windows-amd64.exe

Usage:
  python scripts/lattice-cli/build.py              # auto-detect tool
  python scripts/lattice-cli/build.py --nuitka     # force Nuitka
  python scripts/lattice-cli/build.py --pyinstaller # force PyInstaller
  python scripts/lattice-cli/build.py --all         # cross-platform (requires tools)
"""

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

CLI_DIR = Path(__file__).parent
CLI_MODULE = CLI_DIR / "lattice_cli"
ENTRYPOINT = CLI_DIR / "lattice"
OUTPUT_NAME = "lattice"
BUILD_DIR = CLI_DIR / "build"
DIST_DIR = Path(__file__).parent.parent.parent / "dist" / "cli"  # ai-saas/dist/cli/


def detect_platform() -> tuple[str, str]:
    """Return (os, arch) strings matching release asset naming."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    os_name = {"linux": "linux", "darwin": "macos", "windows": "windows"}.get(system, system)
    arch = {
        "x86_64": "amd64", "amd64": "amd64",
        "aarch64": "arm64", "arm64": "arm64",
    }.get(machine, machine)

    return os_name, arch


def build_with_nuitka(output_path: Path) -> bool:
    """Compile to native binary via Nuitka (Python → C → machine code)."""
    print(f"\n  Building with Nuitka ...")
    print(f"  Output: {output_path}")

    cmd = [
        sys.executable, "-m", "nuitka",
        "--standalone",
        "--onefile",
        f"--output-filename={output_path.name}",
        f"--output-dir={output_path.parent}",
        "--assume-yes-for-downloads",       # auto-download dependencies
        "--remove-output",                  # remove build dir after
        "--no-pyi-file",                    # no .pyi stubs
        "--python-flag=no_site",            # faster startup
        str(ENTRYPOINT),
    ]

    # Include package data (no resources needed for CLI, but flag for safety)
    cmd.insert(-1, f"--include-package=lattice_cli")

    r = subprocess.run(cmd, check=False)
    return r.returncode == 0


def build_with_pyinstaller(output_path: Path) -> bool:
    """Bundle into single executable via PyInstaller (source bundled, not compiled)."""
    print(f"\n  Building with PyInstaller ...")
    print(f"  Output: {output_path}")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", output_path.stem,
        "--distpath", str(output_path.parent),
        "--workpath", str(BUILD_DIR / "pyinstaller-work"),
        "--specpath", str(BUILD_DIR),
        "--clean",
        "--noconfirm",
        str(ENTRYPOINT),
    ]

    r = subprocess.run(cmd, check=False)

    # PyInstaller outputs with .exe on Windows — rename for consistency
    exe_path = output_path.with_suffix(".exe" if platform.system() == "Windows" else "")
    if exe_path != output_path and exe_path.exists():
        shutil.move(str(exe_path), str(output_path))

    return r.returncode == 0


def check_tool(tool: str) -> bool:
    """Check if a build tool is importable."""
    try:
        __import__(tool)
        return True
    except ImportError:
        return False


def build(target_platform: str | None = None, force_tool: str | None = None) -> Path | None:
    """Build the lattice binary. Returns output path on success, None on failure."""

    os_name, arch = detect_platform() if not target_platform else target_platform.split("-")
    suffix = ".exe" if os_name == "windows" else ""
    asset_name = f"lattice-{os_name}-{arch}{suffix}"
    output_path = DIST_DIR / asset_name

    DIST_DIR.mkdir(parents=True, exist_ok=True)

    # Choose build tool
    if force_tool == "nuitka":
        if not check_tool("nuitka"):
            print(f"  ✗ Nuitka not installed. Run: pip install nuitka ordered-set")
            return None
        if build_with_nuitka(output_path):
            return output_path
        return None

    if force_tool == "pyinstaller":
        if not check_tool("PyInstaller"):
            print(f"  ✗ PyInstaller not installed. Run: pip install pyinstaller")
            return None
        if build_with_pyinstaller(output_path):
            return output_path
        return None

    # Auto-detect: prefer Nuitka, fall back to PyInstaller
    if check_tool("nuitka"):
        print(f"  ▸ Using Nuitka (native compilation — IP protection enabled)")
        if build_with_nuitka(output_path):
            return output_path
        print(f"  ⚠ Nuitka failed — falling back to PyInstaller")

    if check_tool("PyInstaller"):
        print(f"  ▸ Using PyInstaller (bundled — source extractable)")
        if build_with_pyinstaller(output_path):
            return output_path

    print(f"\n  ✗ No build tool available.")
    print(f"    Install one:")
    print(f"      pip install nuitka ordered-set   # preferred (native compile)")
    print(f"      pip install pyinstaller            # fallback (bundle)")
    return None


def build_all_platforms():
    """Cross-compile for all target platforms.

    True cross-platform Nuitka builds require running on each OS natively
    (Nuitka doesn't cross-compile). For CI, run this in a matrix.
    """
    targets = ["linux-amd64", "linux-arm64", "macos-amd64", "macos-arm64"]
    results = {}

    # Only build for current platform (matrix handles others in CI)
    os_name, arch = detect_platform()
    target = f"{os_name}-{arch}"
    if target in targets:
        path = build(target)
        results[target] = path
        if path:
            print(f"\n  ✓ Built: {path}")
        else:
            print(f"\n  ✗ Failed: {target}")

    print(f"\n  Note: Cross-compilation requires running this script on each OS/arch.")
    print(f"  Use GitHub Actions matrix (see .github/workflows/build-lattice-cli.yml)")
    print(f"  to produce all binaries automatically.")


if __name__ == "__main__":
    force = None
    if "--nuitka" in sys.argv:
        force = "nuitka"
    elif "--pyinstaller" in sys.argv:
        force = "pyinstaller"
    elif "--all" in sys.argv:
        build_all_platforms()
        sys.exit(0)

    path = build(force_tool=force)
    if path:
        print(f"\n  ✓ Binary ready: {path}")
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"    Size: {size_mb:.1f} MB")
        sys.exit(0)
    else:
        sys.exit(1)
