
import { OpenAIParser } from '../lib/import/parsers/openai';
import { AnthropicParser } from '../lib/import/parsers/anthropic';

// Mock Data for OpenAI
const mockOpenAIExport = [
    {
        id: "conv-1",
        title: "Test OpenAI Chat",
        create_time: 1700000000,
        update_time: 1700001000,
        current_node: "node-3",
        mapping: {
            "node-1": {
                id: "node-1",
                message: {
                    id: "msg-1",
                    author: { role: "system" },
                    create_time: 1700000000,
                    content: { content_type: "text", parts: ["System Prompt"] }
                },
                children: ["node-2"]
            },
            "node-2": {
                id: "node-2",
                parent: "node-1",
                message: {
                    id: "msg-2",
                    author: { role: "user" },
                    create_time: 1700000010,
                    content: { content_type: "text", parts: ["Hello OpenAI"] }
                },
                children: ["node-3"]
            },
            "node-3": {
                id: "node-3",
                parent: "node-2",
                message: {
                    id: "msg-3",
                    author: { role: "assistant" },
                    create_time: 1700000020,
                    content: {
                        content_type: "multimodal_text",
                        parts: [
                            "Here is an image:",
                            { content_type: "image_asset_pointer", asset_pointer: "file-service://img-123" }
                        ]
                    }
                },
                children: []
            }
        }
    }
];

// Mock Data for Anthropic
const mockAnthropicExport = [
    {
        uuid: "anth-1",
        name: "Test Anthropic Chat",
        created_at: "2023-11-15T10:00:00Z",
        updated_at: "2023-11-15T10:05:00Z",
        chat_messages: [
            {
                uuid: "msg-a1",
                sender: "human",
                text: "Hello Claude",
                created_at: "2023-11-15T10:00:00Z",
                updated_at: "2023-11-15T10:00:00Z"
            },
            {
                uuid: "msg-a2",
                sender: "assistant",
                text: "Hello Human",
                created_at: "2023-11-15T10:01:00Z",
                updated_at: "2023-11-15T10:01:00Z"
            }
        ]
    }
];


import { GeminiParser } from '../lib/import/parsers/gemini';
import { PerplexityParser } from '../lib/import/parsers/perplexity';
import { ManusParser } from '../lib/import/parsers/manus';

// Mock Data for Gemini
const mockGeminiExport = [
    {
        conversationId: "gemini-1",
        title: "Test Gemini Chat",
        createdTime: "2023-12-01T10:00:00Z",
        messages: [
            { author: "user", content: "Hi Gemini", timestamp: "2023-12-01T10:00:00Z" },
            { author: "model", content: "Hi User", timestamp: "2023-12-01T10:01:00Z" }
        ]
    }
];

// Mock Data for Perplexity
const mockPerplexityExport = [
    {
        link: "https://perplexity.ai/search/test",
        title: "Perplexity Search",
        messages: [
            { role: "user", content: "Search for X", timestamp: "2023-12-02T10:00:00Z" },
            { role: "assistant", content: "Result X", timestamp: "2023-12-02T10:00:05Z" }
        ]
    }
];

// Mock Data for Manus (Empty/Placeholder)
const mockManusExport = { manus_meta: { version: "1" } };

async function verify() {
    console.log("Starting Verification...\n");

    // 1. Test OpenAI
    console.log("--- Testing OpenAI Parser ---");
    const openaiParser = new OpenAIParser();
    if (!openaiParser.validateFormat(mockOpenAIExport)) throw new Error("OpenAI Validation Failed");
    const resultOpenAI = openaiParser.parse(mockOpenAIExport);
    console.log(`OpenAI Parsed: ${resultOpenAI.conversations.length} items`);
    console.log("OpenAI Test Complete.\n");

    // 2. Test Anthropic
    console.log("--- Testing Anthropic Parser ---");
    const anthropicParser = new AnthropicParser();
    if (!anthropicParser.validateFormat(mockAnthropicExport)) throw new Error("Anthropic Validation Failed");
    const resultAnthropic = anthropicParser.parse(mockAnthropicExport);
    console.log(`Anthropic Parsed: ${resultAnthropic.conversations.length} items`);
    console.log("Anthropic Test Complete.\n");

    // 3. Test Gemini
    console.log("--- Testing Gemini Parser ---");
    const geminiParser = new GeminiParser();
    if (!geminiParser.validateFormat(mockGeminiExport)) throw new Error("Gemini Validation Failed");
    const resultGemini = geminiParser.parse(mockGeminiExport);
    console.log(`Gemini Parsed: ${resultGemini.conversations.length} items`);
    console.log("Gemini Test Complete.\n");

    // 4. Test Perplexity
    console.log("--- Testing Perplexity Parser ---");
    const perplexityParser = new PerplexityParser();
    if (!perplexityParser.validateFormat(mockPerplexityExport)) throw new Error("Perplexity Validation Failed");
    const resultPerplexity = perplexityParser.parse(mockPerplexityExport);
    console.log(`Perplexity Parsed: ${resultPerplexity.conversations.length} items`);
    console.log("Perplexity Test Complete.\n");

    // 5. Test Manus
    console.log("--- Testing Manus Parser ---");
    const manusParser = new ManusParser();
    if (!manusParser.validateFormat(mockManusExport)) throw new Error("Manus Validation Failed");
    // Manus is placeholder, just ensuring it runs
    manusParser.parse(mockManusExport);
    console.log("Manus Test Complete.\n");

    console.log("ALL TESTS PASSED.");
}

verify().catch(console.error);
