import 'dotenv/config';
import { GoIOHarness } from '../lib/harness/GoIOHarness';

async function main() {
    const workspaceId = "test_workspace_1";
    const userId = "test_user_id";
    const ioHarness = new GoIOHarness(process.cwd());

    console.log("==========================================");
    console.log("Phase 4 - Local Vector Index Verification");
    console.log("==========================================");

    console.log("Initializing Go Daemon...");
    await ioHarness.initialize();

    console.log("\n>>> Scenario 1: Semantic Search on Empty/Uninitialized Index");
    try {
        const result = await ioHarness.semanticSearch("How does the WAF handle out-of-bounds access?", workspaceId, userId);
        if (!result.ok) {
            console.error("❌ Search Failed:", result.error);
        } else {
            console.log("✅ Search Succeeded!");
            const parsed = JSON.parse(result.output);
            console.log(`Returned ${parsed?.length || 0} results.`);
            if (parsed?.length > 0) {
                console.log("Top result:", parsed[0].FilePath);
            } else {
                console.log("Index is correctly empty/no results found.");
            }
        }
    } catch (e: any) {
        console.error("❌ Unexpected Error:", e.message);
    }

    console.log("\nShutting down daemon...");
    ioHarness.shutdown?.();
    process.exit(0);
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
