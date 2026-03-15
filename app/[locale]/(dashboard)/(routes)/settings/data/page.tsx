"use client";

import { Heading } from "@/components/heading";
import { Database, Download, HardDrive, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataImportWizard } from "@/components/DataImportWizard";
import { MemoryControlPanel } from "@/components/memory/MemoryControlPanel";
import { Separator } from "@/components/ui/separator";

const DataSettingsPage = () => {
    return (
        <div>
            <Heading
                title="Data & Memory"
                description="Manage your imported conversations, memory bank, and data privacy."
                icon={Database}
                iconColor="text-pink-700"
                bgColor="bg-pink-700/10"
            />

            <div className="px-4 lg:px-8 space-y-8 pb-10">
                {/* Import Section */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-medium">Import Data</h3>
                        <p className="text-sm text-muted-foreground">
                            Bring your chat history from other platforms into Genie.
                        </p>
                    </div>
                    <Separator />

                    <DataImportWizard />
                </div>

                {/* Memory Management Section (Placeholder for visual completeness) */}
                {/* Memory Management Section */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-medium">Memory Center</h3>
                        <p className="text-sm text-muted-foreground">
                            View and manage what Genie knows about you.
                        </p>
                    </div>
                    <Separator />

                    <MemoryControlPanel />
                </div>

                {/* Export Data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8">
                    <Card className="p-6 border-black/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-lg">
                                <Download className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-semibold">Export Data</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Download all your conversations and memories.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <Button variant="outline" className="w-full">
                                Request Data Export
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default DataSettingsPage;
