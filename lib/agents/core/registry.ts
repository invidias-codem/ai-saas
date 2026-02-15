
import { Tool, SecurityPolicy, AgentContext, ToolResult } from './types';
import { z } from 'zod';

/**
 * Registry to manage available tools and enforce security policies.
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    constructor() { }

    /**
     * Register a new tool.
     */
    register(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
    }

    /**
     * Get a tool by name.
     */
    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all tools properly formatted for the Gemini API (Vertex AI).
     */
    getToolsForGemini(): any[] {
        const functionDeclarations = Array.from(this.tools.values()).map(tool => {
            return {
                name: tool.name,
                description: tool.description,
                parameters: this.zodToGeminiParameters(tool.schema)
            };
        });

        return [{
            functionDeclarations
        }];
    }

    /**
     * Execute a tool with security checks.
     */
    async executeTool(name: string, input: any, context: AgentContext): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return { success: false, error: `Tool '${name}' not found.` };
        }

        // 1. P0 Security Check: Role-based Access
        if (tool.risk === 'mutative' && context.userRole !== 'admin') {
            return {
                success: false,
                error: `Security Violation: User '${context.userId}' is not authorized to use mutative tool '${name}'.`
            };
        }

        // 2. Human-in-the-Loop Check
        if (tool.requiresApproval) {
            return {
                success: false,
                userApprovalNeeded: true,
                error: `Tool '${name}' requires human approval.`
            };
        }

        // 3. Schema Validation
        const validation = tool.schema.safeParse(input);
        if (!validation.success) {
            return {
                success: false,
                error: `Input validation failed for '${name}': ${JSON.stringify(validation.error.format())}`
            };
        }

        // 4. Execution with Timeout
        try {
            // Simple timeout wrapper
            const timeoutMs = tool.timeoutMs || 30000; // Default 30s
            const result = await Promise.race([
                tool.execute(validation.data, context),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timed out')), timeoutMs))
            ]);

            return { success: true, data: result };

        } catch (error: any) {
            console.error(`[ToolRegistry] Execution failed for '${name}':`, error);
            return { success: false, error: error.message || 'Unknown execution error' };
        }
    }

    /**
     * Helper to convert Zod schema to Gemini's expected JSON Schema format.
     * Note: This is a simplified mapper. For complex nested schemas, use 'zod-to-json-schema'.
     */
    private zodToGeminiParameters(schema: z.ZodType<any>): any {
        // This is a basic implementation. 
        // In a real app, rely on `zod-to-json-schema` package.

        // Check if it's a ZodObject
        if (schema instanceof z.ZodObject) {
            const shape = schema.shape;
            const properties: any = {};
            const required: string[] = [];

            for (const key in shape) {
                const fieldSchema = shape[key];
                const description = fieldSchema.description;

                // Map types (simplified)
                let type = 'string';
                let enumValues: string[] | undefined;

                // Handle basic types
                if (fieldSchema instanceof z.ZodNumber) type = 'number';
                if (fieldSchema instanceof z.ZodBoolean) type = 'boolean';
                if (fieldSchema instanceof z.ZodArray) type = 'array';
                if (fieldSchema instanceof z.ZodObject) type = 'object';

                // Handle Enums (Direct)
                if (fieldSchema instanceof z.ZodEnum) {
                    type = 'string';
                    enumValues = fieldSchema._def.values;
                }

                properties[key] = {
                    type,
                    description,
                    ...(enumValues ? { enum: enumValues } : {})
                };

                // Helper to check optionality by looking at the schema structure
                // Zod doesn't have a simple isOptional() on the base type effectively unless wrapped
                // But generally safeParse handles it. For JSON schema 'required' array:
                if (!fieldSchema.isOptional()) {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties,
                required
            };
        }

        // Fallback for simple inputs
        return {
            type: 'object',
            properties: {
                input: { type: 'string', description: 'Input value' }
            }
        };
    }
}
