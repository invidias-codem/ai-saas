# lattice-cli

**Sovereign AI Infrastructure Management CLI (v0.2.0)**

The official command-line tool for deploying, managing, and upgrading
[Lattice OS](https://gen1e.xyz) Docker appliance instances.

## Prerequisites

- **Python 3.10+** (zero external dependencies — stdlib only)
- **Docker Engine** (20.10+) with **Compose v2 plugin**
- **Docker Hub account** with a Personal Access Token (PAT)

Generate your PAT at [hub.docker.com/settings/security](https://hub.docker.com/settings/security)
with `read` scope for pulling private images.

## Installation

### Option 1: Pre-built binary (recommended)
```bash
curl -sL https://raw.githubusercontent.com/invidias-codem/ai-saas/main/scripts/lattice-cli/install.sh | bash
```

### Option 2: From source
```bash
cd scripts/lattice-cli
pip install -e .
```

### Option 3: Build standalone binary
```bash
pip install nuitka ordered-set
python scripts/lattice-cli/build.py --nuitka
```

## Quick Start

```bash
# 1. Authenticate with Docker Hub
lattice auth login

# 2. Activate your deployment license
lattice license activate LATTICE-ENT-<your-token>

# 3. Deploy
lattice deploy start

# 4. Verify everything is healthy
lattice health check

# 5. View logs
lattice health logs --follow
```

## Commands

### Authentication

| Command | Description |
|---|---|
| `lattice auth login` | Authenticate with Docker Hub using a PAT |
| `lattice auth logout` | Clear cached credentials |
| `lattice auth status` | Show authentication status |
| `lattice auth generate` | Generate a deployment license token |

### Deployment

| Command | Description |
|---|---|
| `lattice deploy init` | Bootstrap .env with secrets |
| `lattice deploy start` | Full deploy with 7-step preflight validation |
| `lattice deploy stop` | Stop all services gracefully |
| `lattice deploy restart` | Restart all services |
| `lattice deploy status` | Show running container status |
| `lattice deploy shell` | Open a shell in the app container |

### License Management

| Command | Description |
|---|---|
| `lattice license activate <key>` | Activate a license key |
| `lattice license deactivate` | Deactivate current license |
| `lattice license show` | Show license status and features |

### Health & Monitoring

| Command | Description |
|---|---|
| `lattice health check` | Run full health check (5-point) |
| `lattice health logs [-f]` | Stream container logs |

### Upgrade & Rollback

| Command | Description |
|---|---|
| `lattice upgrade upgrade` | Upgrade to newer image (default: latest) |
| `lattice upgrade rollback` | Rollback to previous image tag |

### Backup & Restore

| Command | Description |
|---|---|
| `lattice backup create` | Snapshot config + Supabase volumes |
| `lattice backup restore <path>` | Restore from a backup |
| `lattice backup list` | List available backups |

### V2 Preflight (runs automatically on deploy start)

| Check | Validates |
|---|---|
| Docker daemon | Running, accessible without sudo |
| Compose v2 | Plugin installed (not deprecated v1) |
| Host resources | ≥4GB RAM, ≥2 CPUs |
| Ports | 3000, 5432, 6379 available |
| Disk space | ≥8GB free |
| Docker auth | PAT configured |
| License | Valid and unexpired |

## Configuration

Config lives in `~/.lattice/`:

```
~/.lattice/
├── config.toml          # Registry, image tag, deployment mode
├── auth.json            # Docker Hub auth cache (PATs never stored)
├── license.json         # Active license key and tier
├── deployments/         # Per-instance state
│   └── default.json
└── backups/             # Backup archives
    └── default/
```

### Custom registry

Edit `~/.lattice/config.toml`:
```toml
registry = "registry.yourcompany.com"
image = "lattice-os"
tag = "v0.2.0"
```

### Air-gapped mode

Set `deployment_mode = "air-gapped"` in config, then pre-load the image:
```bash
docker load -i lattice-os-v0.2.0.tar.gz
lattice deploy start --skip-pull
```

## Architecture Decisions

| Decision | Rationale |
|---|---|
| **Zero external deps** | Stdlib only → no dependency conflicts on client machines |
| **PAT auth via stdin** | Tokens never appear in `/proc/*/cmdline` or shell history |
| **No phone-home** | License activation is local only — supports air-gapped networks |
| **Feature-gated tiers** | Community (free) vs Enterprise — gating in config, not billing |
| **Config-first** | All state in `~/.lattice/` — easy to backup, audit, and version |

## License Keys

Format: `LATTICE-<TIER>-<32 hex chars>`

| Tier | SSO | Multi-node | RBAC | Workspaces |
|---|---|---|---|---|
| Community | ✗ | ✗ | ✗ | 5 |
| Enterprise | ✓ | ✓ | ✓ | Unlimited |

---

Built by [JJEM Global Technology, Inc.](https://gen1e.xyz)
