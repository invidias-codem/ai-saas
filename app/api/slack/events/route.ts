import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { getSlackConfig } from "@/lib/slack/tokenManager";
import { HarnessFactory } from "@/lib/harness/IOHarness";
import { generateConversationReply } from "@/lib/llm/conversationEngine";
import { TrajectoryStep } from "@/lib/agents/core/types";
import { SlackTraceFormatter } from "@/lib/slack/slackTraceFormatter";
import { exportTaskTraceToOpik, OpikTracePayload } from "@/lib/telemetry/opikExporter";
import { recordThreadTerminated } from "@/lib/telemetry/evaluation";
import { verifySlackSignature, requireSlackSignature } from "@/lib/slack/slackVerification";
import { emitSlackTelemetry, extractTelemetryFields } from "@/lib/slack/slackTelemetry";
import { getWorkspaceAccess } from "@/lib/security/workspaceAccess";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
    const bodyText = await req.text();

    // 1. Verify Slack Signature FIRST (before any retry/idempotency logic)
    const sigCheck = requireSlackSignature(req, bodyText);
    if (sigCheck) {
        emitSlackTelemetry({
            type: 'slack_signature_invalid',
            teamId: 'unknown',
            eventType: 'unknown',
            channelId: '',
            threadTs: '',
            userId: '',
            error: sigCheck.status === 500 ? 'missing_secret' : 'invalid_signature'
        });
        return sigCheck;
    }

    const payload = JSON.parse(bodyText);

    if (payload.type === "url_verification") {
        return NextResponse.json({ challenge: payload.challenge });
    }

    if (payload.type === "event_callback") {
        const event = payload.event;
        const teamId = payload.team_id;

        if (!teamId) {
            emitSlackTelemetry({
                type: 'slack_config_missing',
                teamId: 'unknown',
                eventType: payload.type,
                channelId: '',
                threadTs: '',
                userId: '',
                error: 'missing_team_id'
            });
            return NextResponse.json({ error: "Missing team_id" }, { status: 400 });
        }

        // Resolve config early for telemetry
        let slackConfig;
        try {
            slackConfig = await getSlackConfig(teamId);
        } catch (configError) {
            emitSlackTelemetry({
                type: 'slack_config_missing',
                teamId,
                eventType: payload.type,
                channelId: '',
                threadTs: '',
                userId: '',
                error: configError instanceof Error ? configError.message : String(configError)
            });
            return NextResponse.json({ error: "Workspace not installed" }, { status: 404 });
        }

        // 2. Retry Handling — signature verified, now check for retries
        // Durable idempotency (Supabase event_id tracking) is S2 work.
        // For S1: log retries but continue processing; S2 will add deduplication.
        if (req.headers.has("x-slack-retry-num")) {
            const retryNum = req.headers.get("x-slack-retry-num");
            const retryReason = req.headers.get("x-slack-retry-reason") || 'unknown';
            emitSlackTelemetry({
                type: 'slack_retry_received',
                teamId: slackConfig.teamId,
                eventType: payload.type,
                channelId: '',
                threadTs: '',
                userId: '',
                metadata: { retryNum, retryReason, eventId: payload.event_id }
            });
            // S1: Do NOT short-circuit. Continue to handler — S2 adds durable idempotency.
        }

        if (event.type === "app_mention" || (event.type === "message" && !event.bot_id)) {
            // Ignore bot's own messages
            if (event.user === slackConfig.botUserId || event.bot_id) {
                return NextResponse.json({ ok: true });
            }

            // Telemetry base (needs to be available for early error emission)
            const telemetryBase = extractTelemetryFields({ teamId: slackConfig.teamId, botUserId: slackConfig.botUserId }, event);

            // Idempotency key: use outer envelope event_id/event_time per Slack Events API spec
            // Require both fields - no fallback to "none" (S2 will persist keys)
            if (!payload.event_id || !payload.event_time) {
                emitSlackTelemetry({
                    ...telemetryBase,
                    type: 'slack_handler_error',
                    error: 'missing_event_id_or_time',
                    metadata: { hasEventId: !!payload.event_id, hasEventTime: !!payload.event_time }
                });
                return NextResponse.json({ ok: true });
            }
            const idempotencyKey = `slack:event:${teamId}:${payload.event_id}:${payload.event_time}`;

            emitSlackTelemetry({
                ...telemetryBase,
                type: 'slack_event_received',
                metadata: { idempotencyKey }
            });

            const processEvent = async () => {
                try {
                    // 1. Resolve actual Slack sender (not installation owner)
                    // The signature verified Slack sent the event; we must resolve who sent the message
                    const slackUserId = event.user;
                    if (!slackUserId) {
                        emitSlackTelemetry({
                            ...telemetryBase,
                            type: 'slack_handler_error',
                            error: 'missing_slack_user_id'
                        });
                        return;
                    }

                    // Resolve to internal user ID (Clerk/Lattice)
                    const { resolveSlackUser } = await import('@/lib/slack/userResolver');
                    const internalUserId = await resolveSlackUser(teamId, slackUserId);

                    // If no internal user resolved, require account linking
                    if (!internalUserId) {
                        emitSlackTelemetry({
                            ...telemetryBase,
                            type: 'slack_handler_error',
                            error: 'slack_user_not_linked',
                            metadata: { slackUserId }
                        });
                        // Send ephemeral message to user to link account
                        await fetch("https://slack.com/api/chat.postEphemeral", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${slackConfig.botToken}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                channel: event.channel,
                                user: slackUserId,
                                text: "Your Slack account is not linked to Lattice. Please run `/genie link` or contact your admin."
                            })
                        });
                        return;
                    }

                    // 2. Verify workspace authorization for resolved internal user
                    // Fail closed if user is not a member of the workspace associated with this Slack installation
                    if (slackConfig.workspaceId) {
                        const workspaceAccess = await getWorkspaceAccess(internalUserId, slackConfig.workspaceId);
                        if (!workspaceAccess) {
                            emitSlackTelemetry({
                                ...telemetryBase,
                                type: 'slack_handler_error',
                                error: 'workspace_access_denied',
                                metadata: { internalUserId, workspaceId: slackConfig.workspaceId }
                            });
                            // Send ephemeral message to user
                            await fetch("https://slack.com/api/chat.postEphemeral", {
                                method: "POST",
                                headers: {
                                    "Authorization": `Bearer ${slackConfig.botToken}`,
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                    channel: event.channel,
                                    user: slackUserId,
                                    text: "You don't have access to this workspace. Contact your admin."
                                })
                            });
                            return;
                        }
                    }
                    if (!slackConfig.workspacePath) {
                        console.error(`[Slack] No workspace path mapped for team ${teamId}`);
                        emitSlackTelemetry({
                            ...telemetryBase,
                            type: 'slack_handler_error',
                            error: 'missing_workspace_path'
                        });
                        return;
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
                      userId: internalUserId,
                      traceId,
                    });

                    const userQuery = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

                    const agentRes = await generateConversationReply({
                        userId: internalUserId,
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
                    console.error("[Slack Event Error]", "stream_error");
                    emitSlackTelemetry({
                        ...telemetryBase,
                        type: 'slack_stream_failed',
                        error: 'stream_failed'
                    });
                }
            };

            waitUntil(processEvent().catch((err) => {
                console.error("[Slack Event Error] waitUntil:", "stream_error");
                emitSlackTelemetry({
                    ...telemetryBase,
                    type: 'slack_stream_failed',
                    error: 'stream_failed'
                });
            }));
        }
    }

    return NextResponse.json({ ok: true });
}
