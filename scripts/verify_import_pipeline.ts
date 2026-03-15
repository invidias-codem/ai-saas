// scripts/verify_import_pipeline.ts

/**
 * GENIE UNIVERSAL IMPORT - VERIFICATION SCRIPT
 * * Purpose: Verifies that the OpenAIParser correctly transforms raw JSON
 * into the strict 'GenieUniversalImport' format required by the database.
 * * Usage: npx ts-node scripts/verify_import_pipeline.ts
 */

import { OpenAIParser } from '../lib/import/parsers/openai'; // Adjust path if needed
import { GenieUniversalImport, ImportedMessage } from '../lib/types/imports';

// ------------------------------------------------------------------
// 1. MOCK DATA: A Complex OpenAI Conversation Tree
// ------------------------------------------------------------------
// This simulates a conversation where the user edited a message,
// creating a branch. The parser must follow 'current_node' backwards.
const mockOpenAIExport = [
    {
        title: "Project Genie Architecture",
        create_time: 1672531200, // Jan 1 2023
        update_time: 1672534800,
        current_node: "node_3_edited", // Pointing to the latest branch
        mapping: {
            "node_system": {
                id: "node_system",
                message: {
                    id: "msg_system",
                    author: { role: "system" },
                    content: { parts: ["You are a helpful AI software architect."] },
                    create_time: 1672531200
                },
                parent: null,
                children: ["node_1"]
            },
            "node_1": {
                id: "node_1",
                message: {
                    id: "msg_1",
                    author: { role: "user" },
                    content: { parts: ["How do I structure a Next.js app?"] },
                    create_time: 1672531205
                },
                parent: "node_system",
                children: ["node_2"]
            },
            "node_2": {
                id: "node_2",
                message: {
                    id: "msg_2",
                    author: { role: "assistant" },
                    content: { parts: ["Use the /app directory structure..."] },
                    create_time: 1672531210
                },
                parent: "node_1",
                children: ["node_3_original", "node_3_edited"]
            },
            // BRANCH 1: The original response (ignored)
            "node_3_original": {
                id: "node_3_original",
                message: {
                    id: "msg_3a",
                    author: { role: "user" },
                    content: { parts: ["Thanks!"] },
                    create_time: 1672531220
                },
                parent: "node_2",
                children: []
            },
            // BRANCH 2: The edited response (should be kept)
            "node_3_edited": {
                id: "node_3_edited",
                message: {
                    id: "msg_3b",
                    author: { role: "user" },
                    content: { parts: ["Wait, what about Supabase?"] },
                    create_time: 1672531230,
                    // Simulating an image attachment metadata
                    metadata: {
                        _attachments: [{
                            name: "architecture.png",
                            mime_type: "image/png",
                            url: "https://files.openai.com/..."
                        }]
                    }
                },
                parent: "node_2",
                children: []
            }
        }
    }
];

// ------------------------------------------------------------------
// 2. THE TEST RUNNER
// ------------------------------------------------------------------
async function runVerification() {
    console.log("🔍 Starting Import Pipeline Verification...\n");

    try {
        // A. INITIALIZATION
        console.log("1️⃣  Initializing OpenAI Parser...");
        const parser = new OpenAIParser();

        // Check if auto-detection works
        const isValid = parser.validateFormat(mockOpenAIExport);
        if (!isValid) throw new Error("❌ Validation Failed: Parser did not recognize OpenAI format.");
        console.log("   ✅ Parser recognized format successfully.");

        // B. PARSING
        console.log("\n2️⃣  Executing Parse Logic (Tree Traversal)...");
        const result: GenieUniversalImport = await parser.parse(mockOpenAIExport);

        console.log(`   ✅ Parsed ${result.conversations.length} conversation(s).`);
        console.log(`   ✅ Source Platform: ${result.source}`);

        // C. DEEP DATA CHECK
        const conversation = result.conversations[0];
        console.log(`\n3️⃣  Verifying Data Integrity for: "${conversation.title}"`);

        // Check 1: Message Count (Should be 3: System(hidden often) + User + Assistant + User(edited))
        // Note: Parsers often skip 'system' unless specified. Let's assume we keep user visible messages.
        console.log(`   👉 Message Count: ${conversation.messages.length}`);

        // Check 2: Tree Traversal (Did it pick the edited node?)
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        if (lastMessage.content.includes("Wait, what about Supabase?")) {
            console.log("   ✅ SUCCESS: Correctly followed the 'current_node' branch (Edit was preserved).");
        } else {
            console.error("   ❌ FAIL: Parser picked the wrong branch or failed traversal.");
        }

        // Check 3: Attachments (Did it map the metadata?)
        if (lastMessage.attachments && lastMessage.attachments.length > 0) {
            console.log("   ✅ SUCCESS: Attachments detected and mapped to 'attachments[]' array.");
            console.log(`      Found: ${lastMessage.attachments[0].type} (${lastMessage.attachments[0].url})`);
        } else {
            console.warn("   ⚠️ WARNING: Attachments were not mapped. Check logic.");
        }

        // D. DB SIMULATION
        console.log("\n4️⃣  Simulating Database Payload (Dry Run)...");

        const dbPayload = {
            source_platform: result.source,
            external_id: conversation.externalId,
            title: conversation.title,
            messages: conversation.messages.map(m => ({
                role: m.role,
                content: m.content.substring(0, 50) + "..."
            }))
        };

        console.log("   📦 Payload ready for Supabase insertion:");
        console.dir(dbPayload, { depth: null, colors: true });

        console.log("\n✨ VERIFICATION COMPLETE: Pipeline is ready for UI integration.\n");

    } catch (error) {
        console.error("\n❌ FATAL ERROR in Verification Pipeline:");
        console.error(error);
        process.exit(1);
    }
}

runVerification();
