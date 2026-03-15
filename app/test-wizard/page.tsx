import { DataImportWizard } from "@/components/DataImportWizard"

export default function TestWizardPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="absolute top-4 left-4 p-4 border rounded-lg bg-card/50 backdrop-blur-sm max-w-sm">
                <h2 className="font-bold mb-2">Dev Controls</h2>
                <p className="text-sm text-muted-foreground">
                    Drag and drop a file or click inside the box.
                    <br />Use &quot;conversations.json&quot; to test OpenAI detection.
                    <br />Use &quot;takeout.zip&quot; to test Gemini detection.
                </p>
            </div>

            <DataImportWizard />
        </div>
    )
}
