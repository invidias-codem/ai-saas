# CLI-Anything Skill Generator

Auto-generates **OpenClaw-compatible `SKILL.md` files** for every CLI-Anything agent harness.

OpenClaw uses `SKILL.md` files to discover, load, and invoke agent skills. This generator reads
harness package metadata and live `--help` output to produce a fully-formed skill file — no
manual authoring required.

---

## Quick Start

```bash
# Generate SKILL.md for a single harness
python3 generate_skill.py --harness-dir ../agent-harnesses/gh/agent-harness

# Generate for all harnesses at once (via bash wrapper)
./generate_skill.sh --all ../agent-harnesses

# Preview without writing (dry run)
python3 generate_skill.py --harness-dir ../agent-harnesses/gh/agent-harness --dry-run
```

---

## How It Works

```
harness-dir/
├── setup.py / pyproject.toml   ← package name, version, description, binary name
├── cli_anything/<name>/*_cli.py ← entry point module
└── SKILL.md                    ← ✨ generated here
```

### Discovery Pipeline

1. **Metadata extraction** — Parses `pyproject.toml` (preferred) or `setup.py` using stdlib
   AST/regex. No `pip install` or import required.

2. **Command discovery** — Runs `<binary> --help` to get the live command list.
   Falls back to:
   - Running `python3 -m <entry_point_module> --help` (if binary not in PATH)
   - AST inspection of `*_cli.py` source (if the module can't execute)

3. **Name derivation** — Converts package name to skill name:
   `cli-anything-gh` → `gh-harness`, `cli-anything-supabase` → `supabase-harness`

4. **SKILL.md rendering** — Fills a template with all discovered data, following the
   OpenClaw skill format exactly (YAML frontmatter + structured Markdown).

---

## Generated SKILL.md Format

```yaml
---
name: gh-harness
description: "Agent harness for GitHub CLI (gh). Use when managing GitHub issues..."
risk: safe
---

# gh-harness — CLI-Anything Harness v1.0.0

## Use this skill when
...

## Commands
| Command | Description |
...

## JSON Output
...

## Safety Rules
...
```

This format is directly compatible with OpenClaw's skill discovery system.

---

## Requirements

- **Python 3.10+** (stdlib only — no external dependencies)
- The underlying CLI tool (gh, supabase, firebase) must be installed for live `--help` discovery
  - If not installed, falls back to source inspection
- Works on macOS, Linux, and Windows (WSL)

---

## Integration with OpenClaw

To register a generated harness skill with OpenClaw:

1. Generate the `SKILL.md`:
   ```bash
   python3 generate_skill.py --harness-dir ./gh/agent-harness
   ```

2. Copy (or symlink) the harness directory to your OpenClaw workspace skills folder:
   ```bash
   ln -s /path/to/agent-harnesses/gh/agent-harness \
         ~/.openclaw/workspace/skills/gh-harness
   ```

3. OpenClaw will discover the skill automatically on next session start.

---

## Adding a New Harness

To support a new CLI tool:

1. Create a new harness under `tools/agent-harnesses/<tool>/agent-harness/`
2. Follow the CLI-Anything harness conventions:
   - `setup.py` or `pyproject.toml` with `console_scripts` entry point
   - Binary named `cli-anything-<tool>`
   - Top-level `--help` listing command groups
3. Run the generator:
   ```bash
   python3 generate_skill.py --harness-dir ../agent-harnesses/<tool>/agent-harness
   ```

No changes to this generator are needed for standard harnesses.

---

## Files

| File | Description |
|------|-------------|
| `generate_skill.py` | Main Python generator (stdlib only, Python 3.10+) |
| `generate_skill.sh` | Bash wrapper; supports `--all` for batch generation |
| `README.md` | This file |

---

## Contributing

This generator is part of the [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything)
ecosystem. The roadmap explicitly targets:
> "Produce SKILL.md alongside the CLI for agent skill discovery and orchestration."

PRs welcome for:
- New platform-specific description templates
- Enhanced command metadata extraction (subcommand descriptions, examples)
- Integration with `clawhub` for automatic skill publishing
