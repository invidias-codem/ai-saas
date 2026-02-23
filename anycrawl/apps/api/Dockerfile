FROM node:20-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_OPTIONS="--max_old_space_size=30000 --max-http-header-size=80000"
ENV NODE_ENV=production

LABEL org.opencontainers.image.source=https://github.com/any4ai/AnyCrawl
LABEL org.opencontainers.image.description="AnyCrawl API Server"
LABEL org.opencontainers.image.licenses=MIT

RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    procps \
    && corepack enable \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /usr/src/app

# Copy package files for dependency installation
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

# Install dependencies with postinstall (build native modules)
RUN --mount=type=cache,id=pnpm-glibc,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN --mount=type=cache,id=pnpm-glibc,target=/pnpm/store pnpm run build:no-docs && pnpm prune --prod

FROM base AS migration
WORKDIR /usr/src/app
# Copy package manifests for workspace resolution
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
# Bring over full packages tree to satisfy workspace links for @anycrawl/db
COPY --from=build /usr/src/app/packages ./packages
# Install devDependencies for @anycrawl/db only (provides drizzle-kit)
RUN --mount=type=cache,id=pnpm-glibc,target=/pnpm/store pnpm install --frozen-lockfile --filter=@anycrawl/db

FROM base AS api
WORKDIR /usr/src/app

# Copy built files and pruned prod dependencies
COPY --from=build /usr/src/app/apps/api /usr/src/app/apps/api
COPY --from=build /usr/src/app/package.json /usr/src/app/pnpm-lock.yaml /usr/src/app/pnpm-workspace.yaml ./
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/node_modules ./node_modules

# Bring in dev tooling (drizzle-kit) from migration stage so we can run migrations locally
COPY --from=migration /usr/src/app/node_modules ./node_modules
COPY --from=migration /usr/src/app/packages/db/node_modules ./packages/db/node_modules

# Copy unified start script and make it executable
COPY docker/start-api.sh /usr/src/app/start-api.sh
RUN chmod +x /usr/src/app/start-api.sh

WORKDIR /usr/src/app/apps/api
EXPOSE 8080

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application via unified script
ENTRYPOINT ["/usr/src/app/start-api.sh"]
