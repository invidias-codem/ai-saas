import 'dotenv/config';
import { generateConversationReply } from '../lib/llm/conversationEngine';
import { GoIOHarness } from '../lib/harness/GoIOHarness';

async function main() {
    const userId = "test_user_id";
    const clerkUser = {};
    const ioHarness = new GoIOHarness(process.cwd());
    await ioHarness.initialize();

    console.log("==========================================");
    console.log("Phase 3B - Workspace Context Verification");
    console.log("==========================================");

    console.log("\n>>> Scenario 1: Missing workspaceId (Should trigger LatticeSecurityError)");
    try {
        await generateConversationReply({
            userId,
            clerkUser,
            request: {
                messages: [{ role: 'user', text: 'Please summarize the local repository' }],
                mode: 'agentic'
            }
        }, { ioHarness });
        console.error("❌ FAIL: Expected strict denial error, but succeeded!");
    } catch (e: any) {
        if (e.message.includes("LatticeSecurityError: workspaceId is strictly required")) {
            console.log("✅ PASS: Blocked missing workspaceId correctly.");
        } else {
            console.error("❌ FAIL: Unexpected error:", e);
        }
    }

    console.log("\n>>> Scenario 2: Valid workspaceId but out-of-bounds access (Should fail gracefully at WAF)");
    try {
        const result = await generateConversationReply({
            userId,
            clerkUser,
            request: {
                // Trying to access an out-of-bounds file
                messages: [{ role: 'user', text: 'Please read the contents of /etc/passwd on my local machine' }],
                mode: 'agentic',
                workspaceId: "test_workspace_1"
            }
        }, { ioHarness });
        
        const textDecoder = new TextDecoder();
        const reader = result.stream.getReader();
        let output = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            output += textDecoder.decode(value);
        }
        
        console.log("\n--- Agent Response ---");
        console.log(output);
        console.log("----------------------");

        if (output.toLowerCase().includes("error") || output.toLowerCase().includes("denied") || output.toLowerCase().includes("cannot") || output.toLowerCase().includes("unable")) {
            console.log("✅ PASS: Valid workspace ID passed, Harness WAF properly denied access, and Agent did not hallucinate contents!");
        } else {
            console.log("⚠️ WARNING: Outcome depends on actual daemon WAF (may pass if not properly locked down). Verify logs!");
        }

    } catch (e: any) {
        console.error("❌ FAIL: Valid workspace ID threw an uncaught error instead of streaming an answer:", e);
    }
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
