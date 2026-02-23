# Crawler Engines Architecture

## Overview

This directory contains the crawler engine implementations for AnyCrawl. The architecture follows a modular design with a base abstract class and concrete implementations for different crawling strategies. The engines leverage core functionality modules located in the parent `core/` directory.

## Directory Structure

```
engines/
├── Base.ts                 # Abstract base engine class
├── EngineFactory.ts        # Factory pattern for engine creation
├── Cheerio.ts             # HTTP-based crawler (fast, no JS)
├── Playwright.ts          # Browser-based crawler (full JS support)
├── Puppeteer.ts           # Browser-based crawler (Chrome/Chromium)
├── index.ts               # Type exports
└── README.md              # This file

../core/                    # Core functionality modules (shared across engines)
├── ConfigValidator.ts      # Configuration validation
├── DataExtractor.ts        # Data extraction logic
├── JobManager.ts           # Job status management
└── EngineConfigurator.ts   # Engine-specific configurations
```

## Engine Factory Pattern

The `EngineFactory.ts` provides a clean and extensible way to create crawler engines without coupling the client code to specific engine implementations.

### Benefits

1. **Separation of Concerns**: Engine creation logic is separated from client code
2. **Easy Extension**: Adding new engine types only requires creating a new factory and registering it
3. **Type Safety**: Strong typing ensures compile-time safety
4. **Single Responsibility**: Each factory is responsible for creating only one type of engine
5. **Centralized Configuration**: Default options and launch contexts are managed in one place

### Usage

```typescript
import { EngineFactoryRegistry } from "./EngineFactory.js";

// Create an engine
const engine = await EngineFactoryRegistry.createEngine("cheerio", queue, options);

// Get all registered engine types
const availableEngines = EngineFactoryRegistry.getRegisteredEngineTypes();
```

## Available Engines

### CheerioEngine

- **Use Case**: Fast HTML scraping without JavaScript execution
- **Performance**: Highest (no browser overhead)
- **JavaScript Support**: No
- **Resource Usage**: Low

### PlaywrightEngine

- **Use Case**: Modern web apps with complex JavaScript
- **Performance**: Good
- **JavaScript Support**: Full
- **Browser Support**: Chromium, Firefox, WebKit
- **Resource Usage**: Medium-High

### PuppeteerEngine

- **Use Case**: Chrome/Chromium-specific features
- **Performance**: Good
- **JavaScript Support**: Full
- **Browser Support**: Chrome/Chromium only
- **Resource Usage**: Medium-High

## Core Modules Integration

The engines leverage shared core modules from `../core/`:

- **ConfigValidator**: Validates engine options and configurations
- **DataExtractor**: Handles data extraction from crawled pages with consistent error handling
- **JobManager**: Manages job status lifecycle (pending, completed, failed)
- **EngineConfigurator**: Applies engine-specific configurations and optimizations

## Configuration Options

All engines support common configuration options through `EngineOptions`:

```typescript
interface EngineOptions {
    minConcurrency?: number; // Minimum concurrent requests
    maxConcurrency?: number; // Maximum concurrent requests
    maxRequestRetries?: number; // Retry failed requests
    requestHandlerTimeoutSecs?: number; // Request timeout
    keepAlive?: boolean; // Keep crawler alive
    proxyConfiguration?: ProxyConfiguration;
    useSessionPool?: boolean;
    persistCookiesPerSession?: boolean;
    headless?: boolean; // Browser engines only
    // ... and more
}
```

### Environment Variables

The following environment variables affect engine behavior:

- `ANYCRAWL_KEEP_ALIVE`: Set to "false" to disable keep-alive mode
- `ANYCRAWL_MIN_CONCURRENCY`: Override default minimum concurrency
- `ANYCRAWL_MAX_CONCURRENCY`: Override default maximum concurrency
- `ANYCRAWL_IGNORE_SSL_ERROR`: Set to "true" to ignore SSL certificate errors

## Adding a New Engine

1. Create a new engine class extending `BaseEngine`:

```typescript
import { BaseEngine } from "./Base.js";

export class CustomEngine extends BaseEngine {
    protected engine: any;
    protected isInitialized = false;

    async init(): Promise<void> {
        // Initialize your crawler using Crawlee or custom implementation
        const { requestHandler, failedRequestHandler } = this.createCommonHandlers(
            this.options.requestHandler,
            this.options.failedRequestHandler
        );

        // Apply configurations
        const crawlerOptions = this.applyEngineConfigurations(
            {
                // your base options
            },
            "custom" as ConfigurableEngineType
        );

        // Initialize the engine
        this.engine = new YourCrawler(crawlerOptions);
        this.isInitialized = true;
    }
}
```

2. Create a factory for the new engine:

```typescript
export class CustomEngineFactory implements IEngineFactory {
    async createEngine(queue: RequestQueueV2, options?: EngineOptions): Promise<CustomEngine> {
        return new CustomEngine({
            ...defaultOptions,
            requestQueue: queue,
            ...options,
        });
    }
}
```

3. Register the factory in `EngineFactory.ts`:

```typescript
EngineFactoryRegistry.register("custom", new CustomEngineFactory());
```

## Type System

The module exports a comprehensive type system:

- `CrawlingContext`: Union type of all supported crawling contexts
- `EngineOptions`: Configuration options for engines
- `Engine`: Union type of all engine implementations
- `IEngineFactory`: Interface for engine factories

## Error Handling

All engines implement consistent error handling through the base class:

- Failed requests are logged with context
- Job status is automatically updated on success/failure
- Extraction errors are handled gracefully with proper error reporting
