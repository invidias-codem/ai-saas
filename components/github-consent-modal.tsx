"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Github } from "lucide-react";

interface GitHubConsentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    action: {
        type: "create_pr" | "commit" | "clone";
        repo: string;
        target?: string; // file or branch
        description: string;
    };
    loading?: boolean;
}

export const GitHubConsentModal = ({
    isOpen,
    onClose,
    onConfirm,
    action,
    loading
}: GitHubConsentModalProps) => {
    return (
        <AlertDialog open={isOpen} onOpenChange={onClose}>
            <AlertDialogContent className="sm:max-w-[425px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Github className="h-5 w-5" />
                        GitHub Action Consent
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Genie is requesting permission to perform the following action on your behalf:
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="py-4 space-y-3">
                    <div className="bg-muted p-3 rounded-md text-sm font-mono space-y-2">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Action:</span>
                            <span className="font-semibold text-foreground">{action.type.toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Repository:</span>
                            <span className="text-foreground">{action.repo}</span>
                        </div>
                        {action.target && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Target:</span>
                                <span className="text-indigo-500">{action.target}</span>
                            </div>
                        )}
                    </div>

                    <p className="text-sm text-muted-foreground">
                        {action.description}
                    </p>
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose} disabled={loading}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm} disabled={loading} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                        {loading ? "Executing..." : "Authorize Action"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
