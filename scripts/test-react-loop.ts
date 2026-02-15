
import { runReActLoop } from '../lib/agents/core/reactLoop';
import { ToolRegistry } from '../lib/agents/core/registry';
import { Tool, AgentContext } from '../lib/agents/core/types';
import { z } from 'zod';

// Mock Agent Context
const mockContext: AgentContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-abc',
    userRole: 'admin',
    history: [],
    enableTelemetry: true
};

// 1. Define "Deal Sentinel" Mock Tools
const webSearchTool: Tool = {
    name: 'web_search',
    description: 'Search the web for real-time information and prices.',
    schema: z.object({
        query: z.string().describe('The search query')
    }),
    risk: 'read-only',
    execute: async ({ query }) => {
        console.log(`[MockTool:web_search] Searching for: "${query}"`);
        // Mock specific sentinel scenario
        if (query.toLowerCase().includes('brake pad')) {
            return {
                results: [
                    { title: 'Maserati Ghibli OEM Brake Pads Front', price: '$150.00', url: 'parts.com' },
                    { title: 'Aftermarket Pads', price: '$85.00', url: 'amazon.com' }
                ]
            };
        }
        return { results: [] };
    }
};

const calculatorTool: Tool = {
    name: 'calculator',
    description: 'Perform mathematical calculations.',
    schema: z.object({
        expression: z.string().describe('The math expression to evaluate')
    }),
    risk: 'read-only',
    execute: async ({ expression }) => {
        console.log(`[MockTool:calculator] Evaluating: "${expression}"`);
        // unsafe eval for mock script only
        try {
            return { result: eval(expression) };
        } catch (e) {
            throw new Error("Invalid math expression");
        }
    }
};

// 2. Setup Registry
const registry = new ToolRegistry();
registry.register(webSearchTool);
registry.register(calculatorTool);

// 3. Run the Loop
async function main() {
    const userQuery = "I have a quote for $400 for Maserati Ghibli OEM brake pads. Is this a fair price? If not, how much over am I paying?";

    console.log("--- Starting ReAct Loop Test ---");
    console.log(`Query: "${userQuery}"`);

    try {
        const result = await runReActLoop(userQuery, mockContext, registry);

        console.log("\n--- Final Result ---");
        console.log("Answer:", result.answer);
        console.log("Status:", result.status);
        console.log("\n--- Trajectory ---");
        result.trajectory.forEach(step => {
            console.log(`[Step ${step.stepNumber}] ${step.thought}`);
            console.log(`   Action: ${step.action.toolName || 'None'}`);
            if (step.observation) {
                console.log(`   Observation: ${JSON.stringify(step.observation.data).substring(0, 50)}...`);
            }
        });

    } catch (error) {
        console.error("Test Failed:", error);
    }
}

main();
