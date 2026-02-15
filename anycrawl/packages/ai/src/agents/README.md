# AI Agents Architecture

This directory contains the refactored AI agent system with clear separation of concerns.

## Architecture Overview

```
BaseAgent (Abstract Base Class)
├── Token counting
├── Cost tracking
├── Model configuration
└── Common LLM operations

LLMExtract (Concrete Agent) extends BaseAgent
├── Text extraction logic
├── Schema-based parsing
└── Uses TextChunker for splitting

TextChunker (Utility Class)
├── Text splitting algorithms
├── Overlap handling
└── Chunk statistics

CostTracking (Standalone Class)
├── Call tracking
├── Cost calculation
└── Summary reporting
```

## Key Components

### 1. BaseAgent

Abstract base class providing common functionality for all AI agents:

- **Token Management**: Count tokens using tiktoken with fallback
- **Cost Tracking**: Automatic cost calculation based on model config
- **Model Configuration**: Smart lookup with priority (full path → provider/model → model name)
- **LLM Instance**: Managed language model instance

### 2. LLMExtract

Concrete implementation for text extraction:

- Extends BaseAgent for all base functionality
- Uses TextChunker for intelligent text splitting
- Supports schema-based extraction with JSONSchema7
- Handles both single and batch extractions

### 3. TextChunker

Independent utility for text chunking:

- Line-based splitting to maintain semantic boundaries
- Configurable overlap for context preservation
- Token-aware chunking
- Statistics and analysis methods

### 4. CostTracking

Comprehensive cost tracking system:

- Per-call tracking with metadata
- Cost limit enforcement
- Multiple output formats (JSON, formatted text)
- Detailed statistics by call type

## Usage Examples

### Basic Extraction

```typescript
import { LLLExtract } from "./agents";

const extractor = new LLMExtract("openrouter/openai/gpt-3.5-turbo");
const result = await extractor.perform(text, schema);
console.log(result.data);
```

### With Cost Limit

```typescript
const extractor = new LLMExtract("openrouter/openai/gpt-4", extractPrompt, 0.1); // $0.10 limit
```

### Chunk Analysis

```typescript
const analysis = extractor.analyzeChunking(longText);
console.log(`Will split into ${analysis.stats.totalChunks} chunks`);
```

### Custom Agent

```typescript
class MyCustomAgent extends BaseAgent {
    async process(input: string) {
        const tokens = this.countTokens(input);
        // Your custom logic here
        this.trackCall("custom", { input }, tokens, 0);
    }
}
```

## Benefits

1. **Separation of Concerns**: Each class has a single, well-defined responsibility
2. **Reusability**: BaseAgent can be extended for different agent types
3. **Testability**: Components can be tested in isolation
4. **Flexibility**: Easy to add new agents or modify existing behavior
5. **Cost Control**: Built-in cost tracking and limits
6. **Type Safety**: Full TypeScript support with proper interfaces

## Future Extensions

- Add more agent types (e.g., LLMClassifier, LLMSummarizer)
- Implement different chunking strategies in TextChunker
- Add streaming support in BaseAgent
- Enhanced cost prediction before execution
- Multi-model ensemble support
