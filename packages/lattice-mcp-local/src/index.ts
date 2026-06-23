#!/usr/bin/env node
import { main } from './server.js';

main().catch((e) => {
  console.error('[lattice-mcp-local] fatal:', e);
  process.exit(1);
});
