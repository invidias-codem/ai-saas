
import { runReActLoop } from '../lib/agents/core/reactLoop';
import { ToolRegistry } from '../lib/agents/core/registry';
import { AgentContext } from '../lib/agents/core/types';
import { dealSentinelTool } from '../lib/agents/tools/dealSentinel';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Mock Context
const mockContext: AgentContext = {
    userId: 'test-user-commerce',
    sessionId: 'test-session-commerce',
    userRole: 'user',
    history: [],
    enableTelemetry: true
};

// Setup Registry
const registry = new ToolRegistry();
registry.register(dealSentinelTool);

async function main() {
    // Scenario: User has a high medical bill
    const userQuery = `
    I just got a bill for an MRI of the knee (CPT 73721) in New York City (10001). 
    They are charging me $2,500. Is this fair? 
    If not, write me a script to call the billing department.
    `;

    console.log("--- Starting Deal Sentinel Verification ---");
    console.log(`Query: "${userQuery.trim()}"`);

    // Check for API Key
    if (!process.env.TAVILY_API_KEY) {
        console.error("❌ ERROR: TAVILY_API_KEY is missing from .env.local");
        // We will continue but expect Tavily to warn
    }

    try {
        const result = await runReActLoop(userQuery, mockContext, registry);

        console.log("\n--- Final Agent Response ---");
        console.log(result.answer);

        console.log("\n--- Trajectory Inspection ---");
        result.trajectory.forEach(step => {
            console.log(`[Step ${step.stepNumber}] ${step.thought.substring(0, 80)}...`);
            if (step.action.toolName) {
                console.log(`   🛠️  Tool: ${step.action.toolName}`);
                console.log(`   Args: ${JSON.stringify(step.action.toolInput)}`);
            }
            if (step.observation) {
                // Handle observation safely
                const data = step.observation.data;
                const obsStr = typeof data === 'string' ? data : JSON.stringify(data);
                console.log(`   👀 Observation (Length): ${obsStr?.length || 0} chars`);
            }
        });

    } catch (error) {
        console.error("Test Failed:", error);
    }
}

main();
