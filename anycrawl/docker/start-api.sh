#!/bin/sh
set -e

# Set default environment variables if not provided (keep from original start-api.sh)
export ANYCRAWL_API_DB_TYPE="${ANYCRAWL_API_DB_TYPE:-sqlite}"
export ANYCRAWL_API_DB_CONNECTION="${ANYCRAWL_API_DB_CONNECTION:-/usr/src/app/storage/anycrawl.db}"
export ANYCRAWL_API_PORT="${ANYCRAWL_API_PORT:-8080}"
export ANYCRAWL_API_AUTH_ENABLED="${ANYCRAWL_API_AUTH_ENABLED:-false}"

# Ensure storage directory exists
mkdir -p /usr/src/app/storage
mkdir -p /usr/src/app/db

# Source engine configuration if available (sets ANYCRAWL_AVAILABLE_ENGINES)
if [ -f "/usr/src/app/set-engines.sh" ]; then
  . /usr/src/app/set-engines.sh
fi

# Database migrations: run once per environment or when forced
MIGRATE_DATABASE="${MIGRATE_DATABASE:-false}"
FIRST_TIME_MIGRATION="/usr/src/app/FIRST_TIME_MIGRATION_${NODE_ENV:-production}"
if [ ! -e "$FIRST_TIME_MIGRATION" ] || [ "$MIGRATE_DATABASE" = "true" ]; then
  echo "Initialize database migration (once per environment)"
  # Touch flag early to avoid duplicate runs under supervisor restarts
  touch "$FIRST_TIME_MIGRATION"
  # Run migration using locally installed drizzle-kit (no pnpm dlx)
  cd /usr/src/app/packages/db
  pnpm db:migrate:docker
  cd /usr/src/app
fi

echo "Starting ${NODE_ENV:-production} server..."
echo "DB type: $ANYCRAWL_API_DB_TYPE | Connection: $ANYCRAWL_API_DB_CONNECTION | Port: $ANYCRAWL_API_PORT | Engines: ${ANYCRAWL_AVAILABLE_ENGINES:-playwright,cheerio,puppeteer}"

# Start the API server
if [ "$NODE_ENV" = "development" ]; then
  echo "Starting development server..."
  cd /usr/src/app/apps/api
  exec pnpm dev
else
  echo "Starting production server..."
  cd /usr/src/app/apps/api
  exec node ./dist/index.js
fi