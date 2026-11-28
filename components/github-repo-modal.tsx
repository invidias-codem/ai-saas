"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle, FolderGit2 } from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";
import axios from "axios";

interface GitHubRepoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onIndexComplete: (repoInfo: { owner: string; repo: string; fileCount: number }) => void;
}

export function GitHubRepoModal({ isOpen, onClose, onIndexComplete }: GitHubRepoModalProps) {
    const [repoUrl, setRepoUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'indexing' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
        // Support formats:
        // https://github.com/owner/repo
        // github.com/owner/repo
        // owner/repo
        const patterns = [
            /github\.com\/([^\/]+)\/([^\/\s]+)/,
            /^([^\/]+)\/([^\/\s]+)$/,
        ];

        for (const pattern of patterns) {
            const match = url.trim().match(pattern);
            if (match) {
                return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
            }
        }
        return null;
    };

    const handleIndex = async () => {
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            setError("Invalid GitHub URL. Use format: owner/repo or https://github.com/owner/repo");
            return;
        }

        setLoading(true);
        setError(null);
        setStatus('indexing');

        try {
            const response = await axios.post("/api/github/index", {
                owner: parsed.owner,
                repo: parsed.repo,
            });

            setStatus('success');
            setProgress({ current: response.data.indexedFiles, total: response.data.totalFiles });
            onIndexComplete({
                owner: parsed.owner,
                repo: parsed.repo,
                fileCount: response.data.indexedFiles,
            });
        } catch (err: any) {
            setStatus('error');
            setError(err.response?.data?.error || "Failed to index repository");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FolderGit2 className="h-5 w-5 text-green-500" />
                        Load GitHub Repository
                    </DialogTitle>
                    <DialogDescription>
                        Paste a GitHub repository URL to give Genie context about your codebase.
                        The repository will be indexed for intelligent code assistance.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="repo-url">Repository URL</Label>
                        <Input
                            id="repo-url"
                            placeholder="owner/repo or https://github.com/owner/repo"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            disabled={loading}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !loading && repoUrl.trim()) {
                                    handleIndex();
                                }
                            }}
                        />
                    </div>

                    {/* Status Display */}
                    {status === 'indexing' && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Indexing repository files...
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-2 rounded-md">
                            <CheckCircle className="h-4 w-4" />
                            Successfully indexed {progress.current} of {progress.total} files
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-2 rounded-md">
                            <XCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleIndex} disabled={loading || !repoUrl.trim()}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Indexing...
                            </>
                        ) : (
                            <>
                                <BrandIcon name="Github" className="mr-2 h-4 w-4" size={16} />
                                Load Repository
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
