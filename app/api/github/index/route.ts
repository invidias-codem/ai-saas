import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { storeMemory } from "@/lib/memory/vectorStore";
import { getGitHubClientForUser } from "@/lib/github";

// File extensions to index
const CODE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
    '.kt', '.scala', '.vue', '.svelte', '.html', '.css', '.scss',
    '.json', '.yaml', '.yml', '.md', '.sql', '.sh', '.bash', '.toml', '.xml'
];

// Files/directories to skip
const SKIP_PATTERNS = [
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    'venv', '.env', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.DS_Store', 'thumbs.db', '.idea', '.vscode'
];

const MAX_FILE_SIZE = 100 * 1024; // 100KB per file
const MAX_FILES = 100; // Limit files to index to avoid abuse/timeout

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo } = await req.json();

    if (!owner || !repo) {
        return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
    }

    try {
        // Require GitHub authentication to prevent rate limit abuse
        let octokit = await getGitHubClientForUser(userId);
        if (!octokit) {
            return NextResponse.json(
                { error: "Please connect your GitHub account first to index repositories" },
                { status: 403 }
            );
        }

        console.log(`[GitHub Index] Starting index for ${owner}/${repo}`);

        // 1. Get repository info to find default branch
        let repoData;
        try {
            const { data } = await octokit.rest.repos.get({ owner, repo });
            repoData = data;
        } catch (e: any) {
            if (e.status === 404) return NextResponse.json({ error: "Repository not found or private (connect GitHub first)" }, { status: 404 });
            throw e;
        }

        const defaultBranch = repoData.default_branch;

        // 2. Fetch tree
        const { data: treeData } = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: defaultBranch,
            recursive: "true",
        });

        if (treeData.truncated) {
            console.warn(`[GitHub Index] Tree truncated for ${owner}/${repo}`);
        }

        // 3. Filter to code files
        const codeFiles = treeData.tree.filter((item: any) => {
            if (item.type !== "blob") return false;
            if (!item.path) return false;

            // Skip unwanted patterns
            if (SKIP_PATTERNS.some(pattern => item.path!.includes(pattern))) return false;

            // Check extension
            const ext = '.' + item.path.split('.').pop()?.toLowerCase();
            return CODE_EXTENSIONS.includes(ext);
        }).slice(0, MAX_FILES);

        console.log(`[GitHub Index] Found ${codeFiles.length} code files to index`);

        // 4. Fetch and index files
        let indexedCount = 0;
        const errors: string[] = [];

        // Process in batches of 5 to respect rate limits
        const BATCH_SIZE = 5;
        for (let i = 0; i < codeFiles.length; i += BATCH_SIZE) {
            const batch = codeFiles.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (file: any) => {
                try {
                    // Skip large files (if size is known in tree)
                    if (file.size && file.size > MAX_FILE_SIZE) {
                        return;
                    }

                    const { data: fileData } = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: file.path!,
                    });

                    if ('content' in fileData && fileData.encoding === 'base64') {
                        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

                        // Basic binary check
                        if (/[\x00-\x08\x0E-\x1F]/.test(content.substring(0, 100))) return;

                        // Chunk large files
                        const chunks = chunkCode(content, file.path!, 3000);

                        for (let j = 0; j < chunks.length; j++) {
                            await storeMemory(
                                userId,
                                chunks[j],
                                'fact', // Using 'fact' type for code context
                                {
                                    featureType: 'github',
                                    repo: `${owner}/${repo}`,
                                    filePath: file.path,
                                    chunkIndex: j,
                                    totalChunks: chunks.length,
                                    language: getLanguageFromPath(file.path!),
                                }
                            );
                        }
                        indexedCount++;
                    }
                } catch (fileError: any) {
                    console.error(`[GitHub Index] Error indexing ${file.path}:`, fileError.message);
                    errors.push(file.path!);
                }
            }));
        }

        console.log(`[GitHub Index] Completed: ${indexedCount}/${codeFiles.length} files indexed`);

        const storedOk = indexedCount > 0 || errors.length === 0;
        return NextResponse.json({
            success: storedOk,
            indexedFiles: indexedCount,
            totalFiles: codeFiles.length,
            errors: errors.length > 0 ? errors : undefined,
            note: storedOk
                ? undefined
                : 'Indexing completed but no chunks were stored. Check Vercel logs for Supabase/embedding errors.',
        });

    } catch (error: any) {
        console.error("[GitHub Index] Error:", error);

        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function chunkCode(content: string, filePath: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk = `// File: ${filePath}\n`;

    for (const line of lines) {
        if (currentChunk.length + line.length > maxChunkSize) {
            chunks.push(currentChunk);
            currentChunk = `// File: ${filePath} (continued)\n`;
        }
        currentChunk += line + '\n';
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk);
    }

    return chunks;
}

function getLanguageFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
        php: 'php', swift: 'swift', kt: 'kotlin', cs: 'csharp',
        md: 'markdown', sh: 'shell', yaml: 'yaml', json: 'json', sql: 'sql'
    };
    return langMap[ext || ''] || ext || 'unknown';
}
