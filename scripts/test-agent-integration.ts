
import { generateConversationReply } from '@/lib/llm/conversationEngine';
import { ConversationRequest } from '@/lib/llm/conversationEngine';

async function main() {
    console.log("--- Starting Agent Integration Verification ---");

    // Mock Context
    const userId = "test-user";
    const clerkUser = { id: userId, firstName: "Test", lastName: "User" };

    // 1. Text-Only Test
    console.log("\n[Test 1] Text-Only Query in Agentic Mode");
    const requestText: ConversationRequest = {
        messages: [{ role: 'user', text: "What is the price of an MRI in NYC normally? Use your tools." }],
        mode: 'agentic-preview'
    };

    try {
        const result = await generateConversationReply({ userId, clerkUser, request: requestText });

        console.log("Stream initialized. Reading stream...");
        const reader = result.stream.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullResponse += decoder.decode(value);
        }

        console.log("Agent Response:", fullResponse);
        if (fullResponse.length > 50) {
            console.log("✅ Check 1 Passed: Agent returned a substantial response.");
        } else {
            console.error("❌ Check 1 Failed: Response too short.");
        }

    } catch (error) {
        console.error("❌ Check 1 Failed:", error);
    }

    // 2. Vision Test (Mock Base64)
    console.log("\n[Test 2] Vision Query (Mock Image)");
    const requestVision: ConversationRequest = {
        messages: [{ role: 'user', text: "Analyze this bill." }],
        mode: 'agentic-preview',
        mimeType: 'image/jpeg',
        // Tiny 1x1 white pixel JPEG
        fileData: "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwH7+P/Z"
    };

    try {
        const result = await generateConversationReply({ userId, clerkUser, request: requestVision });

        // We just want to check if it crashes or returns something. 
        // The mock image is meaningless so reasoning will be garbage, but the *flow* is what matters.
        const reader = result.stream.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullResponse += decoder.decode(value);
        }

        console.log("Agent Response (Vision):", fullResponse);
        console.log("✅ Check 2 Passed: Vision flow executed without crashing.");

    } catch (error) {
        console.error("❌ Check 2 Failed:", error);
    }
}

main();
