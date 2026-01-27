"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useProModal } from "@/hooks/use-pro-modal";
import { SupportGenie } from "@/components/SupportGenie";

export const ProModal = () => {
    const proModal = useProModal();

    return (
        <Dialog open={proModal.isOpen} onOpenChange={proModal.onClose}>
            <DialogContent className="sm:max-w-md overflow-y-auto max-h-[90vh]">
                <DialogHeader className="hidden">
                    <DialogTitle>Support Genie</DialogTitle>
                    <DialogDescription>
                        Unlock automated credits by supporting the project.
                    </DialogDescription>
                </DialogHeader>
                <SupportGenie onSuccess={proModal.onClose} />
            </DialogContent>
        </Dialog>
    );
};
