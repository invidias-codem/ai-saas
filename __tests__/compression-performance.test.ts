import { compress, decompress, compressObject, decompressObject } from '../lib/compression';

/**
 * Compression Performance Benchmark Suite
 * Tests compression ratio, speed, and network transfer improvements
 */

// Sample data representing typical AI-generated content
const SAMPLE_TEXTS = {
  shortMessage: "Hello, how can I help you today?",
  mediumMessage: `Here's a detailed explanation of React hooks:

React Hooks are functions that let you use state and other React features without writing a class. The most commonly used hooks are:

1. useState - Manages component state
2. useEffect - Handles side effects
3. useContext - Accesses context values
4. useCallback - Memoizes callback functions
5. useMemo - Memoizes computed values

Each hook serves a specific purpose and helps make your components more functional and easier to understand.`,

  longMessage: `# Complete Guide to TypeScript

TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.

## Key Features

### Type Safety
TypeScript adds optional types to JavaScript that support tools for large-scale JavaScript applications. Types enable JavaScript developers to use highly-productive development tools and practices like static checking and code refactoring when developing JavaScript applications.

### Modern JavaScript Features
TypeScript supports the latest JavaScript features and compiles them down to older JavaScript versions. This means you can use modern syntax while maintaining compatibility with older browsers.

### Object-Oriented Programming
TypeScript has excellent support for object-oriented programming concepts like classes, interfaces, and inheritance. This makes it easier to structure large applications.

### Tooling Support
The TypeScript compiler provides excellent IDE support with features like:
- IntelliSense and code completion
- Refactoring tools
- Navigation and search
- Error detection before runtime

## Getting Started

To install TypeScript globally:
\`\`\`bash
npm install -g typescript
\`\`\`

Create a new TypeScript file (example.ts):
\`\`\`typescript
interface User {
  name: string;
  age: number;
  email: string;
}

function greetUser(user: User): string {
  return \`Hello, \${user.name}! You are \${user.age} years old.\`;
}

const myUser: User = {
  name: "Alice",
  age: 30,
  email: "alice@example.com"
};

console.log(greetUser(myUser));
\`\`\`

Compile and run:
\`\`\`bash
tsc example.ts
node example.js
\`\`\`

This comprehensive type system helps catch errors early and makes your code more maintainable.`.repeat(3), // Repeat to make it larger

  codeResponse: `Here's a complete implementation of a REST API with Express and TypeScript:

\`\`\`typescript
import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

const app = express();
app.use(express.json());

// In-memory database
const users: Map<string, User> = new Map();

// Error handling middleware
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
};

// GET all users
app.get('/api/users', (req: Request, res: Response) => {
  const userList = Array.from(users.values());
  res.json({ users: userList, count: userList.length });
});

// GET user by ID
app.get('/api/users/:id', (req: Request, res: Response) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// POST create user
app.post('/api/users',
  body('name').isString().notEmpty(),
  body('email').isEmail(),
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: req.body.name,
      email: req.body.email,
      createdAt: new Date()
    };

    users.set(newUser.id, newUser);
    res.status(201).json(newUser);
  }
);

// PUT update user
app.put('/api/users/:id',
  body('name').optional().isString(),
  body('email').optional().isEmail(),
  (req: Request, res: Response) => {
    const user = users.get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = {
      ...user,
      name: req.body.name || user.name,
      email: req.body.email || user.email
    };

    users.set(req.params.id, updatedUser);
    res.json(updatedUser);
  }
);

// DELETE user
app.delete('/api/users/:id', (req: Request, res: Response) => {
  const deleted = users.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.status(204).send();
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
\`\`\`

This implementation includes proper TypeScript types, validation, error handling, and follows REST conventions.`.repeat(2)
};

const SAMPLE_MESSAGES = [
  { role: "user", text: "What is React?" },
  { role: "bot", text: SAMPLE_TEXTS.mediumMessage },
  { role: "user", text: "Can you explain hooks in more detail?" },
  { role: "bot", text: SAMPLE_TEXTS.longMessage },
  { role: "user", text: "Show me a code example" },
  { role: "bot", text: SAMPLE_TEXTS.codeResponse }
];

interface BenchmarkResult {
  testName: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string;
  compressionTime: number;
  decompressionTime: number;
  networkSavings: string;
}

function measurePerformance(testName: string, originalData: string | any): BenchmarkResult {
  const isObject = typeof originalData !== 'string';
  const originalString = isObject ? JSON.stringify(originalData) : originalData;
  const originalSize = new Blob([originalString]).size;

  // Measure compression time
  const compressStart = performance.now();
  const compressed = isObject ? compressObject(originalData) : compress(originalData);
  const compressEnd = performance.now();
  const compressionTime = compressEnd - compressStart;

  const compressedSize = new Blob([compressed]).size;

  // Measure decompression time
  const decompressStart = performance.now();
  const decompressed = isObject ? decompressObject(compressed) : decompress(compressed);
  const decompressEnd = performance.now();
  const decompressionTime = decompressEnd - decompressStart;

  // Verify integrity
  const decompressedString = isObject ? JSON.stringify(decompressed) : decompressed;
  if (decompressedString !== originalString) {
    throw new Error(`Data integrity check failed for ${testName}`);
  }

  const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
  const networkSavings = `${(originalSize / 1024).toFixed(2)} KB → ${(compressedSize / 1024).toFixed(2)} KB`;

  return {
    testName,
    originalSize,
    compressedSize,
    compressionRatio: `${compressionRatio}%`,
    compressionTime: parseFloat(compressionTime.toFixed(3)),
    decompressionTime: parseFloat(decompressionTime.toFixed(3)),
    networkSavings
  };
}

describe('Compression Performance Benchmarks', () => {
  const results: BenchmarkResult[] = [];

  afterAll(() => {
    console.log('\n📊 COMPRESSION PERFORMANCE REPORT\n');
    console.log('═'.repeat(100));

    results.forEach(result => {
      console.log(`\n🔹 ${result.testName}`);
      console.log(`   Original Size: ${(result.originalSize / 1024).toFixed(2)} KB`);
      console.log(`   Compressed Size: ${(result.compressedSize / 1024).toFixed(2)} KB`);
      console.log(`   Compression Ratio: ${result.compressionRatio} reduction`);
      console.log(`   Compression Time: ${result.compressionTime} ms`);
      console.log(`   Decompression Time: ${result.decompressionTime} ms`);
      console.log(`   Network Savings: ${result.networkSavings}`);
    });

    console.log('\n' + '═'.repeat(100));

    const avgCompressionRatio = results.reduce((sum, r) =>
      sum + parseFloat(r.compressionRatio), 0) / results.length;
    const avgCompressionTime = results.reduce((sum, r) =>
      sum + r.compressionTime, 0) / results.length;
    const avgDecompressionTime = results.reduce((sum, r) =>
      sum + r.decompressionTime, 0) / results.length;

    console.log('\n📈 SUMMARY STATISTICS');
    console.log(`   Average Compression Ratio: ${avgCompressionRatio.toFixed(2)}%`);
    console.log(`   Average Compression Time: ${avgCompressionTime.toFixed(3)} ms`);
    console.log(`   Average Decompression Time: ${avgDecompressionTime.toFixed(3)} ms`);
    console.log(`   Total Tests: ${results.length}`);
    console.log('\n');
  });

  test('Short message compression', () => {
    const result = measurePerformance('Short Message (< 100 chars)', SAMPLE_TEXTS.shortMessage);
    results.push(result);
    expect(result.compressionTime).toBeLessThan(10);
  });

  test('Medium message compression', () => {
    const result = measurePerformance('Medium Message (~500 chars)', SAMPLE_TEXTS.mediumMessage);
    results.push(result);
    expect(parseFloat(result.compressionRatio)).toBeGreaterThanOrEqual(-10); // May expand for very short text
  });

  test('Long message compression', () => {
    const result = measurePerformance('Long Message (~5KB)', SAMPLE_TEXTS.longMessage);
    results.push(result);
    expect(parseFloat(result.compressionRatio)).toBeGreaterThan(20); // Realistic for repeated text
  });

  test('Code response compression', () => {
    const result = measurePerformance('Code Response (~3KB)', SAMPLE_TEXTS.codeResponse);
    results.push(result);
    expect(parseFloat(result.compressionRatio)).toBeGreaterThan(25); // Code compresses well
  });

  test('Message array compression', () => {
    const result = measurePerformance('Message Array (6 messages)', SAMPLE_MESSAGES);
    results.push(result);
    expect(parseFloat(result.compressionRatio)).toBeGreaterThan(25); // Mixed content
  });

  test('Large conversation history compression', () => {
    const largeHistory = Array(20).fill(null).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'bot',
      text: i % 2 === 0 ? SAMPLE_TEXTS.mediumMessage : SAMPLE_TEXTS.longMessage
    }));
    const result = measurePerformance('Large Conversation (20 messages)', largeHistory);
    results.push(result);
    expect(parseFloat(result.compressionRatio)).toBeGreaterThan(50);
  });

  test('Compression speed for 1KB threshold', () => {
    const text1KB = 'a'.repeat(1024);
    const start = performance.now();
    const compressed = compress(text1KB);
    const end = performance.now();
    const time = end - start;

    console.log(`\n⚡ 1KB payload compression: ${time.toFixed(3)} ms`);
    expect(time).toBeLessThan(5); // Should be very fast
  });

  test('Decompression speed benchmark', () => {
    const compressed = compress(SAMPLE_TEXTS.longMessage);
    const iterations = 100;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      decompress(compressed);
    }
    const end = performance.now();
    const avgTime = (end - start) / iterations;

    console.log(`\n⚡ Average decompression time (${iterations} iterations): ${avgTime.toFixed(3)} ms`);
    expect(avgTime).toBeLessThan(3); // Very fast decompression
  });
});
