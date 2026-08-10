import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { getSlackConfig } from "@/lib/slack/tokenManager";
import { HarnessFactory } from "@/lib/harness/IOHarness";
import { generateConversationReply } from "@/lib/llm/conversationEngine";
import { TrajectoryStep } from "@/lib/agents/core/types";
import { SlackTraceFormatter } from "@/lib/slack/slackTraceFormatter";
import { exportTaskTraceToOpik, OpikTracePayload } from "@/lib/telemetry/opikExporter";
import { recordThreadTerminated } from "@/lib/telemetry/evaluation";

export const maxDuration = 300;

function verifySlackSignature(req: NextRequest, body: string): boolean {
    const signature = req.headers.get("x-slack-signature");
    const timestamp = req.headers.get("x-slack-request-timestamp");
    const secret = process.env.SLACK_SIGNING_SECRET;

    if (!signature || !timestamp || !secret) return false;

    const fiveMinutes = 5 * 60;
    if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)) > fiveMinutes) return false;

    const sigBaseString = `v0:${timestamp}:${body}`;
    const mySignature = "v0=" + crypto.createHmac("sha256", secret).update(sigBaseString, "utf8").digest("hex");
    
    try {
        return crypto.timingSafeEqual(Buffer.from(mySignature, 'utf8'), Buffer.from(signature, 'utf8'));
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest) {
    // 2. Idempotency & Retry Storm Prevention
    if (req.headers.has("x-slack-retry-num")) {
        return NextResponse.json({ ok: true });
    }

    const bodyText = await req.text();
    
    if (!verifySlackSignature(req, bodyText)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = JSON.parse(bodyText);

    if (payload.type === "url_verification") {
        return NextResponse.json({ challenge: payload.challenge });
    }

    if (payload.type === "event_callback") {
        const event = payload.event;
        const teamId = payload.team_id;

        if (event.type === "app_mention" || (event.type === "message" && !event.bot_id)) {
            const processEvent = async () => {
                try {
                    const slackConfig = await getSlackConfig(teamId);
                    
                    if (!slackConfig.workspacePath) {
                        console.error(`[Slack] No workspace path mapped for team ${teamId}`);
                        return; // Strict tenant resolution: reject without fallback.
                    }

                    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${slackConfig.botToken}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            channel: event.channel,
                            thread_ts: event.thread_ts || event.ts,
                            blocks: SlackTraceFormatter.getBootupBlocks(),
                            text: "Gen1e is spinning up..."
                        })
                    });
                    const postData = await postRes.json();
                    if (!postData.ok) return;

                    const messageTs = postData.ts;
                    let lastUpdate = 0;
                    let pendingUpdate: NodeJS.Timeout | null = null;
                    let currentTrajectory: TrajectoryStep[] = [];
                    const startTimeMs = Date.now();

                    // 3. Throttled UI Streaming (1.5s max rate)
                    const flushSlackUpdate = async () => {
                        pendingUpdate = null;
                        lastUpdate = Date.now();

                        await fetch("https://slack.com/api/chat.update", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${slackConfig.botToken}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                channel: event.channel,
                                ts: messageTs,
                                blocks: SlackTraceFormatter.getActiveTraceBlocks(currentTrajectory),
                                text: "Agent Execution in Progress"
                            })
                        });
                    };

                    const slackStreamCallback = (step: TrajectoryStep) => {
                        const existing = currentTrajectory.findIndex(t => t.stepNumber === step.stepNumber);
                        if (existing >= 0) {
                            currentTrajectory[existing] = step;
                        } else {
                            currentTrajectory.push(step);
                        }

                        if (!pendingUpdate) {
                            const now = Date.now();
                            const timeSince = now - lastUpdate;
                            if (timeSince > 1500) {
                                flushSlackUpdate();
                            } else {
                                pendingUpdate = setTimeout(flushSlackUpdate, 1500 - timeSince);
                            }
                        }
                    };

                    const traceId = randomUUID();
                    const ioHarness = await HarnessFactory.create({
                      env: 'local',
                      workspaceRoot: slackConfig.workspacePath,
                      workspaceId: slackConfig.workspaceId || undefined,
                      userId: slackConfig.userId || undefined,
                      traceId,
                    });

                    const userQuery = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

                    const agentRes = await generateConversationReply({
                        userId: slackConfig.userId || `slack-${teamId}`,
                        clerkUser: null as any,
                        request: {
                            messages: [{ role: 'user', text: userQuery }],
                            mode: 'agentic'
                        }
                    }, {
                        ioHarness,
                        slackStreamCallback
                    });

                    const reader = agentRes.stream.getReader();
                    const decoder = new TextDecoder();
                    let finalAnswer = "";
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        finalAnswer += decoder.decode(value, { stream: true });
                    }

                    if (pendingUpdate) {
                        clearTimeout(pendingUpdate);
                    }

                    await fetch("https://slack.com/api/chat.update", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${slackConfig.botToken}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            channel: event.channel,
                            ts: messageTs,
                            blocks: SlackTraceFormatter.getResolutionBlocks(finalAnswer, currentTrajectory, startTimeMs),
                            text: "Execution Completed"
                        })
                    });

                    const durationMs = Date.now() - startTimeMs;
                    const slackTrace: OpikTracePayload = {
                        traceId,
                        workspaceId: slackConfig.workspaceId || `slack-${teamId}`,
                        orgId: '',
                        taskType: 'slack_event',
                        memoryNodeIds: [],
                        executionSteps: currentTrajectory.length,
                        interceptedCount: 0,
                        durationMs,
                        metadata: {
                            slack_team_id: teamId,
                            slack_channel: event.channel,
                            slack_user: event.user,
                            slack_message_ts: event.ts,
                        },
                        tags: ['slack', ...(event.channel ? [`channel:${event.channel}`] : [])],
                    };

                    try {
                        void exportTaskTraceToOpik(slackTrace);
                    } catch {
                        // Do not fail Slack delivery due to observability backend issues.
                    }

                    try {
                        void recordThreadTerminated({
                            traceId,
                            channel: event.channel,
                            threadTs: event.thread_ts || event.ts,
                            teamId,
                            workspaceId: slackConfig.workspaceId || `slack-${teamId}`,
                            userId: slackConfig.userId || undefined,
                        });
                    } catch {
                        // Do not fail Slack delivery due to observability backend issues.
                    }

                    if (ioHarness?.shutdown) {
                        ioHarness.shutdown();
                    }
                } catch (err: any) {
                    console.error("[Slack Event Error]", err);
                }
            };

            waitUntil(processEvent());
        }
    }

    return NextResponse.json({ ok: true });
}
