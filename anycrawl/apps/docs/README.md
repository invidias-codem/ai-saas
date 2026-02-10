# AnyCrawl API Documentation

This project contains the documentation system for AnyCrawl API, built with [Fumadocs](https://fumadocs.vercel.app/).

## OpenAPI Specification Generation

### Overview

This documentation system includes functionality to automatically generate OpenAPI 3.1.0 specifications directly from the API project's Zod schemas to create standard API documentation.

### Usage

#### Generate OpenAPI Specification

```bash
# Generate OpenAPI specification once
pnpm run generate-openapi

# Watch mode - automatically regenerate on file changes
pnpm run generate-openapi:watch
```

#### Build Documentation

```bash
# Build documentation (will automatically generate OpenAPI specification)
pnpm run build

# Development mode
pnpm run dev
```

### File Structure

```
apps/docs/
├── scripts/
│   └── generate-openapi.ts    # OpenAPI generation script
├── openapi.json              # Generated OpenAPI specification (gitignored)
├── package.json              # Contains generation scripts
└── README.md                 # This document
```

### Notes

- `openapi.json` is a generated file and has been added to `.gitignore`
- The build process will automatically generate the latest OpenAPI specification
- Schemas are kept in sync with the API project to ensure documentation accuracy
