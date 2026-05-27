
import { z } from "zod";
import type { IOHarness } from "@/lib/harness/IOHarness";

/**
 * Capability-based security levels for tools.
 */
export type SecurityPolicy = 'read-only' | 'analysis' | 'mutative';

/**
 * Action taken by the agent in a single step.
 */
export type AgentActionType = 'tool_use' | 'final_answer' | 'awaiting_approval';

/**
 * Represents a tool available to the agent.
 */
export interface Tool<TInput = any, TOutput = any> {
    name: string;
    description: string;

    /**
     * Zod schema for input validation.
     * This is the "contract" between the LLM and the code.
     */
    schema: z.ZodType<TInput>;

    /**
     * Complexity/Cost metadata.
     */
    risk: SecurityPolicy;
    timeoutMs?: number;
    maxCallsPerSession?: number;

    /**
     * If true, the agent must pause and request user confirmation before execution.
     */
    requiresApproval?: boolean;

    /**
     * The actual function to execute.
     */
    execute: (input: TInput, context: AgentContext) => Promise<TOutput>;
}

/**
 * Context available to the agent during execution.
 */
export interface AgentContext {
    userId: string;
    sessionId: string;

    /**
     * User's verified identity/permissions.
     */
    userRole?: 'admin' | 'user';

    /**
     * Short-term memory / conversation history.
     */
    history: any[]; // Using any[] for now, should map to ChatMessage

    /**
     * Telemetry / Debugging
     */
    enableTelemetry: boolean;

    /**
     * Execution Harness for local workspace changes
     */
    ioHarness?: IOHarness;

    /**
     * Callback fired whenever the agent updates its thought or executes a tool.
     */
    onStep?: (step: TrajectoryStep) => void;
}

/**
 * Structured log of an agent's reasoning step.
 * Used for "Trajectory" analysis and debugging.
 */
export interface TrajectoryStep {
    stepNumber: number;
    timestamp: string;

    thought: string;

    action: {
        type: AgentActionType;
        toolName?: string;
        toolInput?: any;
        reason?: string; // For final answer
    };

    observation?: {
        status: 'success' | 'error' | 'pending_approval';
        data?: any;
        error?: string;
        summary?: string; // If data was truncated
    };

    tokensUsed?: number;
    latencyMs?: number;
}

/**
 * Result of a tool execution, standardized.
 */
export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    userApprovalNeeded?: boolean;
}
