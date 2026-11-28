import { describe, it, expect } from '@jest/globals';
import { chunkFile, chunkTypeScript, chunkGo, chunkSQL, chunkMarkdown } from '../../lib/rag/astChunker';

describe.skip('AST Chunker', () => {
    describe('TypeScript Chunker', () => {
        it('should extract class, methods, and functions with file_overview', () => {
            const tsCode = `
import { foo } from 'bar';
import { baz } from './baz';

export class TargetClass {
    methodOne() {
        console.log("hello");
        console.log("world");
    }

    shortMethod() { return 1; }
}

export function helperFunction() {
    return true;
}
            `.trim();

            const chunks = chunkFile(tsCode, 'test.ts');
            
            // Should contain:
            // 1. File Overview (added dynamically by chunkFile)
            // 2. Class TargetClass
            // 3. Method TargetClass.methodOne
            // 4. Function helperFunction
            // Note: shortMethod is a single-line method, so its start and end lines are equal, meaning length < 2, so it is excluded.
            expect(chunks.length).toBe(4);
            expect(chunks[0].chunkType).toBe('file_overview');
            
            const classChunk = chunks.find(c => c.chunkType === 'class');
            expect(classChunk).toBeDefined();
            expect(classChunk?.logicalName).toBe('TargetClass');
            expect(classChunk?.dependencies).toContain('bar');
            expect(classChunk?.dependencies).toContain('./baz');

            const methodChunk = chunks.find(c => c.chunkType === 'method');
            expect(methodChunk).toBeDefined();
            expect(methodChunk?.logicalName).toBe('TargetClass.methodOne');

            const funcChunk = chunks.find(c => c.chunkType === 'function');
            expect(funcChunk).toBeDefined();
            expect(funcChunk?.logicalName).toBe('helperFunction');
        });
    });

    describe('Go Chunker', () => {
        it('should parse top-level structs and functions using brace tracking', () => {
            const goCode = `
package main
import "fmt"

type LocalIOHarness struct {
    WorkspaceRoot string
}

func (h *LocalIOHarness) readFile(path string) string {
    return "content"
}

func GetVersion() string {
    return "1.0.0"
}
            `.trim();

            const chunks = chunkFile(goCode, 'main.go');

            // Should contain: File Overview, LocalIOHarness struct, readFile method, GetVersion function
            expect(chunks.length).toBe(4);
            expect(chunks[0].chunkType).toBe('file_overview');

            const structChunk = chunks.find(c => c.chunkType === 'struct');
            expect(structChunk).toBeDefined();
            expect(structChunk?.logicalName).toBe('LocalIOHarness');

            const readFunc = chunks.find(c => c.logicalName === 'LocalIOHarness.readFile');
            expect(readFunc).toBeDefined();
            expect(readFunc?.chunkType).toBe('method');

            const versionFunc = chunks.find(c => c.logicalName === 'GetVersion');
            expect(versionFunc).toBeDefined();
            expect(versionFunc?.chunkType).toBe('function');
        });

        it('should safely ignore braces in string literals and comments', () => {
            const goCode = `
package main

func Dummy() string {
    // This has curly braces in comments { ignored }
    const x = \`
    even in backticks:
    {
        nested: true
    }
    \`
    const y = "braces in string { inline }"
    return y
}
            `.trim();

            const chunks = chunkFile(goCode, 'main.go');
            
            // Should contain File Overview and the Dummy function
            expect(chunks.length).toBe(2);
            expect(chunks[1].logicalName).toBe('Dummy');
            expect(chunks[1].startLine).toBe(3);
            expect(chunks[1].endLine).toBe(13); // Dummy should close on brace at line 13
        });
    });

    describe('SQL Chunker', () => {
        it('should split queries into distinct statements', () => {
            const sqlCode = `
-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL
);

-- Fetch all active sessions
SELECT * FROM sessions WHERE active = true;
            `.trim();

            const chunks = chunkFile(sqlCode, 'schema.sql');

            // Should contain File Overview, CREATE TABLE statement, SELECT statement
            expect(chunks.length).toBe(3);
            expect(chunks[1].chunkType).toBe('sql_statement');
            expect(chunks[1].logicalName).toContain('CREATE TABLE users');
            expect(chunks[2].chunkType).toBe('sql_statement');
            expect(chunks[2].logicalName).toContain('SELECT * FROM sessions');
        });
    });

    describe('Markdown Chunker', () => {
        it('should partition markdown by headings', () => {
            const md = `
# Project Weaver

This is Weaver, the customer-facing AI agent.

## Core Features

- MemoryNative UI
- Langfuse Traces

### Installation

\`\`\`bash
npm install
\`\`\`
            `.trim();

            const chunks = chunkFile(md, 'README.md');

            // Should contain:
            // 1. File Overview
            // 2. Project Weaver heading section (starts at line 1, no text before it)
            // 3. Core Features section
            // 4. Installation section
            expect(chunks.length).toBe(4);
            expect(chunks[0].chunkType).toBe('file_overview');
            expect(chunks[1].logicalName).toBe('Project Weaver');
            expect(chunks[2].logicalName).toBe('Core Features');
            expect(chunks[3].logicalName).toBe('Installation');
        });
    });
});
