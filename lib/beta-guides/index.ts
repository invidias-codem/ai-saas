/**
 * Beta onboarding guide content.
 *
 * Four tracks, one per URL:
 *   /en/beta/start     — Quick Start (anyone, 15 min install + first chat)
 *   /en/beta/dev       — Developer (source build, CI, custom workflows)
 *   /en/beta/enterprise — Team / Enterprise (licensing, RBAC, SSO)
 *   /en/beta/privacy   — Privacy & Compliance (air-gap, HIPAA, GDPR)
 */

export type GuideStep = {
  title: string;
  body: string;          // Markdown-ish plain blocks (we render as-is with prose styling)
  command?: string;       // Optional terminal command to copy
};

export type BetaGuide = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  persona: string;
  duration: string;
  outcome: string;
  prerequisites: string[];
  steps: GuideStep[];
  nextCta: {
    label: string;
    href: string;
  };
};

const PREREQS_SHARED = [
  "Docker Engine 20.10+ with Compose v2 plugin installed",
  "4 GB RAM minimum (8 GB recommended for Enterprise tier)",
  "A free email to receive your beta Enterprise license key",
];

// ─────────────────────────────────────────────────────────────────────────────
// QUICK START — the "I just said yes, get me running" track
// ─────────────────────────────────────────────────────────────────────────────
const START: BetaGuide = {
  id: "start",
  eyebrow: "Track · Quick Start",
  title: "Lattice OS in 15 minutes",
  subtitle:
    "You said yes — let's ship it. This track gets you a live Lattice OS instance on your machine, from a blank shell to your first memory-aware conversation.",
  persona: "Anyone evaluating Lattice OS",
  duration: "≈ 15 minutes",
  outcome: "A running Lattice OS instance with one workspace and one memory-aware conversation.",
  prerequisites: PREREQS_SHARED,
  steps: [
    {
      title: "1. Install the CLI",
      body:
        "The lattice CLI is a single compiled binary. Pick whichever method works for you — curl is fastest, pip is universal.",
      command:
        "curl -sL https://lattice.sh/install.sh | bash\n# or: pip install git+https://github.com/invidias-codem/ai-saas.git#subdirectory=scripts/lattice-cli",
    },
    {
      title: "2. Verify the install",
      body: "You should see the version banner.",
      command: "lattice --version",
    },
    {
      title: "3. Authenticate with Docker Hub",
      body:
        "We use a Personal Access Token (PAT) to pull private images. Generate one at hub.docker.com/settings/security with `read` scope — we never need write.",
      command: "lattice auth login",
    },
    {
      title: "4. Activate your beta Enterprise license",
      body:
        "JJ will send the V3 license key to you over the channel you signed up on (Threads DM → email). It is cryptographically signed — you can't forge one, and neither can we after it's issued.",
      command: "lattice license activate <paste-your-key-here>",
    },
    {
      title: "5. Initialize the deployment",
      body:
        "This generates a `~/.lattice/deployments/beta.env` with fresh secrets. Edit it and fill in the Supabase and Clerk keys (JJ will link you to the quick Supabase setup).",
      command: "lattice deploy init --name beta --tier enterprise",
    },
    {
      title: "6. Deploy",
      body:
        "The CLI runs a 7-step preflight before it touches Docker: daemon, Compose v2, RAM/CPU, ports, disk, auth, license. If anything fails, the fix is printed with the error.",
      command: "lattice deploy start --name beta",
    },
    {
      title: "7. Verify it's alive",
      body: "A green report means you're in.",
      command: "lattice health check",
    },
    {
      title: "8. Open the app and chat",
      body:
        "Open http://localhost:3000. Sign in with Clerk. Create a workspace, start a conversation, ask it to remember a fact, and close the browser. Open it again — the memory should be there. That's the whole point of Lattice OS.",
    },
    {
      title: "9. (Optional) Watch your containers",
      body: "See which services are up and follow the logs in real time.",
      command: "lattice deploy status && lattice health logs --follow",
    },
  ],
  nextCta: { label: "Try the Developer track", href: "/beta/dev" },
};

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER — the "I want to hack on this" track
// ─────────────────────────────────────────────────────────────────────────────
const DEV: BetaGuide = {
  id: "dev",
  eyebrow: "Track · Developer",
  title: "Deploy from source, ship from your CI",
  subtitle:
    "You want to run the code, not just the container. This track covers building Lattice OS locally, wiring it into an Nginx/Caddy reverse proxy, and running the CLI in your own CI pipeline.",
  persona: "Software engineers, infra engineers, and curious tinkerers",
  duration: "≈ 45 minutes",
  outcome: "Lattice OS running locally from source with a self-built Docker image, plus CI workflow stub.",
  prerequisites: [
    ...PREREQS_SHARED,
    "Node 22+ and pnpm 11.6+",
    "Git, make, and a comfortable terminal",
  ],
  steps: [
    {
      title: "1. Clone the repo and install",
      body:
        "The monorepo lives at github.com/invidias-codem/ai-saas. Clone it and boot the lattice CLI from source so every edit you make is live.",
      command:
        "git clone https://github.com/invidias-codem/ai-saas.git\ncd ai-saas/scripts/lattice-cli\npip install -e .",
    },
    {
      title: "2. Read the architecture",
      body:
        "Before you change anything: `vision.md` is the source of truth. Lattice has three logical layers — Reflex (sub-10ms local), Memory (context recall), Heavy Compute (frontier models) — event-gated, not poll-based. The UCOL routing layer sits underneath everything. Don't touch it without reading `lib/ucol/`.",
    },
    {
      title: "3. Build your own Docker image",
      body:
        "The root `Dockerfile` emits Next.js standalone output. You can build and tag locally to ship to your own registry.",
      command:
        "cd ai-saas\ndocker build -t lattice-os:dev .\ndocker tag lattice-os:dev registry.yourco.com/lattice-os:dev\ndocker push registry.yourco.com/lattice-os:dev",
    },
    {
      title: "4. Tell the CLI about your registry",
      body: "Edit `~/.lattice/config.toml` — everything else still works the same.",
      command:
        "cat > ~/.lattice/config.toml << 'EOF'\nregistry = \"registry.yourco.com\"\nimage = \"lattice-os\"\ntag = \"dev\"\ndeployment_mode = \"standard\"\npreflight_secret_name = \"PREFLIGHT_SECRET\"\ncompose_file = \"docker-compose.yml\"\nEOF",
    },
    {
      title: "5. Deploy from your own image",
      body: "The standard flow applies — only the image source changed.",
      command: "lattice deploy init --name dev && lattice deploy start --name dev",
    },
    {
      title: "6. Wire it into your CI (GitHub Actions example)",
      body:
        "Put this in `.github/workflows/lattice-deploy.yml`. The CLI is installable inside any Node workflow — no Docker inside Docker.",
      command:
        "- name: Install lattice CLI\n  run: pip install git+https://github.com/invidias-codem/ai-saas.git#subdirectory=scripts/lattice-cli\n- name: Deploy\n  env:\n    LATTICE_LICENSE: ${{ secrets.LATTICE_LICENSE }}\n    PREFLIGHT_SECRET: ${{ secrets.PREFLIGHT_SECRET }}\n  run: |\n    lattice auth login --username ${{ secrets.DOCKER_USER }} --token ${{ secrets.DOCKER_PAT }}\n    lattice license activate \"$LATTICE_LICENSE\"\n    lattice deploy start --name ci",
    },
    {
      title: "7. Build the compiled binary yourself",
      body:
        "If you want the standalone `lattice` binary without Python on the host, install Nuitka and run the build pipeline. Output lands in `dist/cli/`.",
      command:
        "pip install nuitka ordered-set\npython ai-saas/scripts/lattice-cli/build.py --nuitka\n./dist/cli/lattice-linux-amd64 --version",
    },
    {
      title: "8. Contribute",
      body:
        "Open an issue, fork, PR. We run CodeQL on main — your CI will fail fast if you touch something sensitive. The codebase is `aidd`-driven; see `AGENTS.md` at the repo root for the agent guidelines.",
    },
  ],
  nextCta: { label: "Try the Enterprise track", href: "/beta/enterprise" },
};

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE — the "my team needs this" track
// ─────────────────────────────────────────────────────────────────────────────
const ENTERPRISE: BetaGuide = {
  id: "enterprise",
  eyebrow: "Track · Enterprise",
  title: "Team deployment: licensing, roles, and SSO",
  subtitle:
    "You're evaluating Lattice OS for a team or department. This track walks through license tiers, workspace isolation, role-based access, and SSO setup — the things procurement will actually ask about.",
  persona: "CTOs, platform engineers, procurement leads",
  duration: "≈ 1 hour",
  outcome: "A multi-user Lattice OS deployment with Enterprise features unlocked.",
  prerequisites: [
    ...PREREQS_SHARED,
    "A Supabase project configured for your team",
    "An identity provider (Okta, Auth0, Azure AD) for SSO",
  ],
  steps: [
    {
      title: "1. Install + authenticate",
      body: "Same as Quick Start — this gets you a binary and Docker Hub access.",
      command: "curl -sL https://lattice.sh/install.sh | bash\nlattice auth login",
    },
    {
      title: "2. Understand the license tiers",
      body:
        "Community is free forever but hard-gated: no SSO, no RBAC, no multi-node, 5 workspace cap. Enterprise unlocks everything. Your beta key is an Enterprise key valid through 2027.",
      command: "lattice license activate <your-beta-key>\nlattice license show",
    },
    {
      title: "3. Deploy with Enterprise tier",
      body:
        "The tier you activate becomes the tier the container boots with — feature gates read it on startup. No separate config needed.",
      command:
        "lattice deploy init --name prod --tier enterprise\n# edit ~/.lattice/deployments/prod.env\nlattice deploy start --name prod",
    },
    {
      title: "4. Workspace = Project (strict isolation)",
      body:
        "This is the most important architectural decision in Lattice OS. Each workspace is a strict memory silo — no cross-pollution. HR context never bleeds into engineering context, period. Every memory write, vector, and audit entry is workspace-scoped. Procurement will love this.",
    },
    {
      title: "5. Wire up Clerk SSO",
      body:
        "Lattice uses Clerk for identity. Configure SAML/SSO in your Clerk dashboard, then set the Clerk keys in your `.env`. Users sign in through your IdP and land in Lattice.",
      command:
        "# In ~/.lattice/deployments/prod.env\nNEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in\nNEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard\nCLERK_SAML_CONNECTION_ID=<from-clerk-dashboard>",
    },
    {
      title: "6. Roles and audit logs",
      body:
        "Enterprise tier unlocks RBAC. The `members` table supports `owner`, `admin`, `editor`, `viewer` roles. Every memory mutation, login, and API call is append-only in the audit log — signed and queryable.",
      command:
        "# Inspect the audit log from inside the running container\nlattice deploy shell --name prod --service app\n# then: psql (or the CLI admin endpoint)",
    },
    {
      title: "7. Set up automated backups",
      body:
        "`lattice backup create` snapshots your config + Supabase volume tarballs into `~/.lattice/backups/<instance>/`. Schedule this with cron — nightly is sane.",
      command:
        "lattice backup create --instance prod\n# Schedule daily:\necho \"0 2 * * * $(which lattice) backup create --instance prod\" | crontab -",
    },
    {
      title: "8. Run the preflight monthly",
      body:
        "Preflight runs automatically on every deploy, but running it manually gives you a clean report any time. Pair with `lattice health check` for a weekly ops sanity check.",
      command: "lattice health check --instance prod",
    },
    {
      title: "9. Upgrades and rollback",
      body:
        "`lattice upgrade` auto-backs up before pulling a new image and one-commands rollback on failure. No data plane risk.",
      command:
        "lattice upgrade upgrade --tag v0.3.0\n# If it breaks:\nlattice upgrade rollback",
    },
  ],
  nextCta: { label: "Try the Privacy track", href: "/beta/privacy" },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY & COMPLIANCE — the "my data cannot leave the building" track
// ─────────────────────────────────────────────────────────────────────────────
const PRIVACY: BetaGuide = {
  id: "privacy",
  eyebrow: "Track · Privacy & Compliance",
  title: "Air-gapped deployment for regulated environments",
  subtitle:
    "HIPAA, GDPR, DORA, SOC 2 — whichever framework you're answering to, it usually comes back to one question: 'can data leave the network?' This track answers it with a zero-egress deployment.",
  persona: "Compliance officers, CISOs, security-focused platform engineers",
  duration: "≈ 1 hour",
  outcome: "A Lattice OS instance that runs entirely offline, with audit-grade logging.",
  prerequisites: [
    ...PREREQS_SHARED,
    "A host with no outbound internet (or a network you control)",
    "Docker image pre-loaded via `docker save` / `docker load`",
  ],
  steps: [
    {
      title: "1. Pre-load the image on an online machine",
      body:
        "On a machine that *can* reach Docker Hub, pull and save the image. You'll carry the tarball into the air-gapped zone on a USB drive.",
      command:
        "docker pull registry.example.com/lattice-os:latest\ndocker save registry.example.com/lattice-os:latest -o lattice-os.tar",
    },
    {
      title: "2. Carry the image + CLI into the zone",
      body:
        "Copy `lattice-os.tar` plus the standalone `lattice` binary (build it with Nuitka on a similar platform — see the /beta/dev track). Transfer both to the air-gapped host.",
      command:
        "# From outside\ndocker load -i lattice-os.tar\n# Verify the image is loaded\ndocker images | grep lattice",
    },
    {
      title: "3. Switch the CLI to air-gapped mode",
      body:
        "This flips the CLI's preflight: it stops checking Docker Hub auth, stops attempting network calls, and writes `AIRGAP_MODE=true` into the deployment `.env`.",
      command:
        "cat >> ~/.lattice/config.toml << 'EOF'\ndeployment_mode = \"air-gapped\"\nEOF",
    },
    {
      title: "4. Deploy with the preloaded image",
      body:
        "The CLI detects air-gapped mode and uses your local image. No pull attempts are made.",
      command:
        "lattice deploy init --name secure --tier enterprise\n# Make sure AIRGAP_MODE=true is in the generated .env\nlattice deploy start --name secure --skip-preflight",
    },
    {
      title: "5. Verify zero egress",
      body:
        "Run the inbuilt air-gapped test — it spawns a throwaway container with `--network=none` and confirms the app still boots.",
      command:
        "# From the CLI (internal test):\npython3 - << 'PY'\nfrom lattice_cli import docker_ops\nprint(docker_ops.test_airgap(\"lattice-os\", \"latest\"))\nPY",
    },
    {
      title: "6. Audit logging is on by default",
      body:
        "Every memory write is cryptographically signed and append-only. `lattice health logs` shows the live audit stream. For compliance reviews, export with:",
      command:
        "lattice health logs --instance secure --service app --tail 10000 > audit-$(date +%Y%m%d).log",
    },
    {
      title: "7. Right-to-deletion (GDPR Article 17)",
      body:
        "Lattice exposes `/api/memory/[id]` DELETE endpoints scoped to the workspace. Workspace-scoped means you can nuke a subject's data without touching anyone else's.",
    },
    {
      title: "8. Upgrade path for air-gapped hosts",
      body:
        "`lattice upgrade` still works — instead of pulling from a registry, you point it at a local tarball.",
      command:
        "# Build a new image on an online host, save it, transfer\ndocker save registry.example.com/lattice-os:v0.4.0 -o lattice-os-v0.4.tar\ndocker load -i lattice-os-v0.4.tar\nlattice upgrade upgrade --tag v0.4.0",
    },
    {
      title: "9. Sign-off document",
      body:
        "Run `lattice health check` and `cat` the deployment state for a point-in-time evidence bundle. Pair it with your internal risk assessment and hand to the auditor.",
      command:
        "lattice health check --instance secure > lattice-health-$(date +%Y%m%d).txt\ncat ~/.lattice/deployments/secure.json",
    },
  ],
  nextCta: { label: "Back to Quick Start", href: "/beta/start" },
};

// ─────────────────────────────────────────────────────────────────────────────

export const GUIDES: Record<string, BetaGuide> = {
  start: START,
  dev: DEV,
  enterprise: ENTERPRISE,
  privacy: PRIVACY,
};

export const GUIDE_IDS = Object.keys(GUIDES);

export function getGuide(id: string): BetaGuide | undefined {
  return GUIDES[id];
}
