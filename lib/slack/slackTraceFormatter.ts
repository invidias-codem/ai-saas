import { TrajectoryStep } from "@/lib/agents/core/types";

export class SlackTraceFormatter {
    
    /**
     * State 1: Bootup
     */
    static getBootupBlocks() {
        return [
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "⏳ *Gen1e is spinning up the Lattice OS harness...*"
                    }
                ]
            }
        ];
    }

    /**
     * State 2: Sliding Window Trace
     */
    static getActiveTraceBlocks(trajectory: TrajectoryStep[]) {
        if (!trajectory || trajectory.length === 0) {
            return this.getBootupBlocks();
        }

        const currentStep = trajectory[trajectory.length - 1];
        const previousStepsCount = trajectory.length - 1;

        const blocks: any[] = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "🔄 *Agent Execution in Progress*"
                }
            },
            {
                type: "divider"
            }
        ];

        if (currentStep.thought) {
            blocks.push({
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `💭 _"${this.escapeMrkdwn(currentStep.thought)}"_`
                    }
                ]
            });
        }

        if (currentStep.action && currentStep.action.toolName) {
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `🛠️ *Executing Tool:* \`${currentStep.action.toolName}\``
                }
            });
        }

        if (previousStepsCount > 0) {
            // Count tools vs total
            const toolsCount = trajectory.slice(0, previousStepsCount).filter(t => t.action?.toolName).length;
            blocks.push({
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `📂 _${previousStepsCount} previous steps completed (${toolsCount} tool invocations)_`
                    }
                ]
            });
        }

        return blocks;
    }

    /**
     * State 3: Resolution
     */
    static getResolutionBlocks(finalAnswer: string, trajectory: TrajectoryStep[], startTimeMs: number) {
        const totalTimeS = ((Date.now() - startTimeMs) / 1000).toFixed(1);
        const toolsCount = trajectory.filter(t => t.action?.toolName).length;

        // Truncate final answer if it exceeds 3000 chars (Block Kit limit)
        const safeAnswer = finalAnswer.length > 2900 
            ? finalAnswer.substring(0, 2900) + "... [truncated]" 
            : finalAnswer;

        return [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: safeAnswer
                }
            },
            {
                type: "divider"
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `✅ *Completed in ${totalTimeS}s* | 🛠️ *${toolsCount} Tool Invocations* | 🧠 *Gen1e Lattice OS*`
                    }
                ]
            }
        ];
    }

    private static escapeMrkdwn(text: string): string {
        // Basic escaping to prevent markdown breakage in slack
        return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}
