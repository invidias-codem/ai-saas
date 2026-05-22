import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import * as ts from 'typescript';

export interface CodeChunk {
    content: string;
    filePath: string;
    logicalName: string;
    chunkType: 'class' | 'interface' | 'function' | 'method' | 'struct' | 'sql_statement' | 'markdown_section' | 'fallback' | 'file_overview';
    startLine: number;
    endLine: number;
    dependencies?: string[];
}

/**
 * Parses and chunks a TypeScript/JavaScript file using the native compiler AST.
 */
export function chunkTypeScript(content: string, filePath: string): CodeChunk[] {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const chunks: CodeChunk[] = [];
    const dependencies: string[] = [];

    // Extract imports as dependencies
    function findImports(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
            if (node.moduleSpecifier) {
                const moduleText = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
                dependencies.push(moduleText);
            }
        }
        ts.forEachChild(node, findImports);
    }
    findImports(sourceFile);

    // Get 1-based start and end lines of a node
    function getLines(node: ts.Node) {
        const startPos = node.getStart(sourceFile);
        const endPos = node.getEnd();
        const startLine = sourceFile.getLineAndCharacterOfPosition(startPos).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(endPos).line + 1;
        return { startLine, endLine };
    }

    // Traverse and extract classes, interfaces, methods, and functions
    function traverse(node: ts.Node) {
        if (ts.isClassDeclaration(node)) {
            const className = node.name ? node.name.text : 'AnonymousClass';
            const { startLine, endLine } = getLines(node);
            const chunkContent = content.substring(node.getStart(sourceFile), node.getEnd());

            chunks.push({
                content: chunkContent,
                filePath,
                logicalName: className,
                chunkType: 'class',
                startLine,
                endLine,
                dependencies
            });

            // Index individual methods within the class
            node.members.forEach(member => {
                if (ts.isMethodDeclaration(member)) {
                    const methodName = member.name ? member.name.getText(sourceFile) : 'AnonymousMethod';
                    const { startLine: mStart, endLine: mEnd } = getLines(member);
                    const methodContent = content.substring(member.getStart(sourceFile), member.getEnd());

                    // Only index methods that are at least 3 lines to keep context meaningful
                    if (mEnd - mStart >= 2) {
                        chunks.push({
                            content: methodContent,
                            filePath,
                            logicalName: `${className}.${methodName}`,
                            chunkType: 'method',
                            startLine: mStart,
                            endLine: mEnd,
                            dependencies
                        });
                    }
                }
            });
        } else if (ts.isInterfaceDeclaration(node)) {
            const interfaceName = node.name ? node.name.text : 'AnonymousInterface';
            const { startLine, endLine } = getLines(node);
            const chunkContent = content.substring(node.getStart(sourceFile), node.getEnd());

            chunks.push({
                content: chunkContent,
                filePath,
                logicalName: interfaceName,
                chunkType: 'interface',
                startLine,
                endLine,
                dependencies
            });
        } else if (ts.isFunctionDeclaration(node)) {
            const funcName = node.name ? node.name.text : 'AnonymousFunction';
            const { startLine, endLine } = getLines(node);
            const chunkContent = content.substring(node.getStart(sourceFile), node.getEnd());

            chunks.push({
                content: chunkContent,
                filePath,
                logicalName: funcName,
                chunkType: 'function',
                startLine,
                endLine,
                dependencies
            });
        } else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach(decl => {
                if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
                    const varName = decl.name.getText(sourceFile);
                    const { startLine, endLine } = getLines(node);
                    const chunkContent = content.substring(node.getStart(sourceFile), node.getEnd());

                    chunks.push({
                        content: chunkContent,
                        filePath,
                        logicalName: varName,
                        chunkType: 'function',
                        startLine,
                        endLine,
                        dependencies
                    });
                }
            });
        }

        ts.forEachChild(node, traverse);
    }

    traverse(sourceFile);
    return chunks;
}

/**
 * Parses and chunks Go files using Go native AST extractor with robust line fallback.
 */
export function chunkGo(content: string, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    let tempPath: string | null = null;
    try {
        let pathToParse = filePath;
        if (!fs.existsSync(filePath)) {
            const scratchDir = path.resolve(process.cwd(), 'go-harness/scratch');
            if (!fs.existsSync(scratchDir)) {
                fs.mkdirSync(scratchDir, { recursive: true });
            }
            tempPath = path.join(scratchDir, `temp_${Date.now()}_${path.basename(filePath) || 'main.go'}`);
            fs.writeFileSync(tempPath, content, 'utf-8');
            pathToParse = tempPath;
        }

        const binaryPath = path.resolve(process.cwd(), 'go-harness/bin/ast-extractor');
        let rawJson = '';

        if (fs.existsSync(binaryPath)) {
            rawJson = execFileSync(binaryPath, ['-file', pathToParse], { encoding: 'utf-8', timeout: 5000 });
        } else {
            // Try standard dynamic Go run location in cellar or custom PATH
            const cellarGo = '/usr/local/Cellar/go/1.26.3/bin/go';
            const scriptPath = path.resolve(process.cwd(), 'go-harness/cmd/ast-extractor/main.go');
            if (fs.existsSync(cellarGo) && fs.existsSync(scriptPath)) {
                rawJson = execFileSync(cellarGo, ['run', scriptPath, '-file', pathToParse], { encoding: 'utf-8', timeout: 5000 });
            } else {
                // Try searching on PATH
                rawJson = execFileSync('go', ['run', scriptPath, '-file', pathToParse], { encoding: 'utf-8', timeout: 5000 });
            }
        }

        const extracted: Array<{
            content: string;
            logicalName: string;
            chunkType: string;
            startLine: number;
            endLine: number;
        }> = JSON.parse(extractedJsonFilter(rawJson));

        extracted.forEach(item => {
            chunks.push({
                content: item.content,
                filePath,
                logicalName: item.logicalName,
                chunkType: item.chunkType as any,
                startLine: item.startLine,
                endLine: item.endLine
            });
        });
    } catch (error) {
        console.error(`[Go Chunker] Go AST extractor failed, falling back to line chunker:`, error);
        const fallbacks = chunkFallback(content, filePath);
        fallbacks.forEach(c => {
            c.dependencies = ['fallback'];
            chunks.push(c);
        });
    } finally {
        if (tempPath && fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (err) {
                console.error(`[Go Chunker] Failed to delete temp file ${tempPath}:`, err);
            }
        }
    }

    return chunks;
}

// Clean any unexpected stdout lines like warnings or logs, keeping only valid JSON array
function extractedJsonFilter(stdout: string): string {
    const startIdx = stdout.indexOf('[');
    const endIdx = stdout.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        return stdout.substring(startIdx, endIdx + 1);
    }
    return stdout;
}

/**
 * Splits SQL files into queries and statements, matching key definitions.
 */
export function chunkSQL(content: string, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const charToLine: number[] = [];
    let currentLine = 1;
    for (let i = 0; i < content.length; i++) {
        charToLine.push(currentLine);
        if (content[i] === '\n') {
            currentLine++;
        }
    }
    charToLine.push(currentLine);

    let i = 0;
    let startIdx = 0;
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let inSingleLineComment = false;
    let inMultiLineComment = false;

    while (i < content.length) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (inSingleLineComment) {
            if (char === '\n') {
                inSingleLineComment = false;
            }
        } else if (inMultiLineComment) {
            if (char === '*' && nextChar === '/') {
                inMultiLineComment = false;
                i++;
            }
        } else if (inDoubleQuote) {
            if (char === '"' && content[i-1] !== '\\') {
                inDoubleQuote = false;
            }
        } else if (inSingleQuote) {
            if (char === "'" && content[i-1] !== '\\') {
                inSingleQuote = false;
            }
        } else {
            if (char === '-' && nextChar === '-') {
                inSingleLineComment = true;
                i++;
            } else if (char === '/' && nextChar === '*') {
                inMultiLineComment = true;
                i++;
            } else if (char === '"') {
                inDoubleQuote = true;
            } else if (char === "'") {
                inSingleQuote = true;
            } else if (char === ';') {
                const endIdx = i;
                const chunkContent = content.substring(startIdx, endIdx + 1).trim();
                const startLine = charToLine[startIdx];
                const endLine = charToLine[endIdx];

                if (chunkContent.length > 0) {
                    const cleanContent = chunkContent.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();
                    const firstLine = cleanContent.split('\n')[0] || '';
                    const logicalName = firstLine.substring(0, 60).trim() || 'SQL Statement';

                    chunks.push({
                        content: chunkContent,
                        filePath,
                        logicalName,
                        chunkType: 'sql_statement',
                        startLine,
                        endLine
                    });
                }
                startIdx = i + 1;
            }
        }
        i++;
    }

    if (startIdx < content.length) {
        const chunkContent = content.substring(startIdx).trim();
        const startLine = charToLine[startIdx];
        const endLine = charToLine[content.length - 1] || startLine;

        if (chunkContent.length > 0) {
            const cleanContent = chunkContent.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();
            const firstLine = cleanContent.split('\n')[0] || '';
            const logicalName = firstLine.substring(0, 60).trim() || 'SQL Statement';

            chunks.push({
                content: chunkContent,
                filePath,
                logicalName,
                chunkType: 'sql_statement',
                startLine,
                endLine
            });
        }
    }

    return chunks;
}

/**
 * Partitions Markdown files by heading levels.
 */
export function chunkMarkdown(content: string, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');

    let currentSectionTitle = 'README / Overview';
    let startLine = 1;
    let sectionLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            if (sectionLines.length > 0) {
                const chunkContent = sectionLines.join('\n');
                if (chunkContent.trim().length > 0) {
                    chunks.push({
                        content: chunkContent,
                        filePath,
                        logicalName: currentSectionTitle,
                        chunkType: 'markdown_section',
                        startLine,
                        endLine: i
                    });
                }
            }

            currentSectionTitle = headingMatch[2].trim();
            startLine = i + 1;
            sectionLines = [line];
        } else {
            sectionLines.push(line);
        }
    }

    if (sectionLines.length > 0) {
        const chunkContent = sectionLines.join('\n');
        if (chunkContent.trim().length > 0) {
            chunks.push({
                content: chunkContent,
                filePath,
                logicalName: currentSectionTitle,
                chunkType: 'markdown_section',
                startLine,
                endLine: lines.length
            });
        }
    }

    return chunks;
}

/**
 * Fallback line-based chunker for other file formats.
 */
export function chunkFallback(content: string, filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    const CHUNK_SIZE = 100;
    const OVERLAP = 20;

    for (let start = 0; start < lines.length; start += (CHUNK_SIZE - OVERLAP)) {
        const end = Math.min(start + CHUNK_SIZE, lines.length);
        const chunkLines = lines.slice(start, end);
        const chunkContent = chunkLines.join('\n');

        chunks.push({
            content: chunkContent,
            filePath,
            logicalName: `Fallback Chunk ${Math.floor(start / (CHUNK_SIZE - OVERLAP)) + 1}`,
            chunkType: 'fallback',
            startLine: start + 1,
            endLine: end
        });

        if (end === lines.length) {
            break;
        }
    }

    return chunks;
}

/**
 * Core entry router that decides the chunking strategy based on file extension.
 * Also appends a file overview chunk to every structurally chunked file.
 */
export function chunkFile(content: string, filePath: string): CodeChunk[] {
    const extension = path.extname(filePath).toLowerCase();
    let chunks: CodeChunk[] = [];

    try {
        if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
            chunks = chunkTypeScript(content, filePath);
        } else if (extension === '.go') {
            chunks = chunkGo(content, filePath);
        } else if (extension === '.sql') {
            chunks = chunkSQL(content, filePath);
        } else if (extension === '.md') {
            chunks = chunkMarkdown(content, filePath);
        } else {
            chunks = chunkFallback(content, filePath);
        }

        if (chunks.length === 0) {
            chunks = chunkFallback(content, filePath);
        } else {
            const lines = content.split('\n');
            const overviewLines = lines.slice(0, Math.min(100, lines.length)).join('\n');
            chunks.unshift({
                content: overviewLines,
                filePath,
                logicalName: 'File Overview',
                chunkType: 'file_overview',
                startLine: 1,
                endLine: Math.min(100, lines.length)
            });
        }
    } catch (error) {
        console.error(`Error chunking ${filePath}, falling back to default:`, error);
        chunks = chunkFallback(content, filePath);
    }

    return chunks;
}
