import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { requireAuth, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { validateRequestSize } from '@/lib/security/inputValidation';
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import { buildInitialRoutingDecision } from './routing/decision';
import { shadowEvaluateRouting } from '@/lib/intelligence/decision/shadowRouter';
import {
    authorizeCanary,
    validateCanaryDecision,
    type CanaryConfig,
    type CanaryPromotionArtifact,
    type CanaryRequestFacts,
} from '@/lib/intelligence/decision/canary';
import {
    checkLease,
    consumeLease,
    issueLease,
    leaseFingerprint,
    type DecisionLeaseRecord,
} from '@/lib/intelligence/decision/lease';
import { QUESTION_SET_VERSION } from '@/lib/intelligence/decision/shadowRouter';
import type { Tier } from '@/lib/intelligence/decision/replay/types';
import { waitUntil } from '@vercel/functions';
import { logEvent } from '@/lib/telemetry';
import { env } from '@/lib/env';
import type { UcolRequestPacket, UcolRoutingDecision } from '@/lib/ucol/routing/types';
import type { RuntimeContextResult } from '@/lib/ucol/runtimeContextResolver';
import type { User } from '@clerk/nextjs/server';
import type { FileAttachmentInput } from '@/lib/types/attachments';
import { buildRoutingDossier } from '@/lib/intelligence/decision/shadowRouter';
import { JevDecisionEngine } from '@/lib/intelligence/decision/engines/jev';

/**
 * Slice 4 canary transport: ONE inline JEV call, strictly deadline-bound by
 * the caller's Promise.race. Returns the semantic capability tier or null.
 * Any failure → null → B2 (validated downstream). No retry, no rescue.
 */
async function canarySemanticTier(rawInput: string): Promise<'fast' | 'quality' | 'reasoning' | null> {
    if (!env.TYPESAFE_API_KEY) return null;
    const { dossier, questions } = buildRoutingDossier({
        request: { requestId: 'canary', rawInput },
        agentMode: 'fast',
        hasAttachments: false,
        messageHistoryCount: 0,
        workspaceBacked: false,
    });
    const engine = new JevDecisionEngine();
    const outcome = await engine.evaluate(dossier, questions);
    if (!outcome.ok) return null;
    const cap = outcome.answers.capability_requirement as { choice?: string } | undefined;
    const t = cap?.choice;
    return t === 'fast' || t === 'quality' || t === 'reasoning' ? t : null;
}

/** Deterministic dossier projection for lease identity — same input, same
 *  string. Uses the SAME buildRoutingDossier as transport so cache identity
 *  can never drift from what the transport actually decided on. */
function canarySemanticDossier(rawInput: string): unknown {
    return buildRoutingDossier({
        request: { requestId: 'canary', rawInput },
        agentMode: 'fast',
        hasAttachments: false,
        messageHistoryCount: 0,
        workspaceBacked: false,
    }).dossier;
}

// Slice 5 lease store: conversation-scoped, in-process only.
// ponytail: module-level Map keyed by conversationId; leases die with the
// lambda and NEVER cross processes. Fine for canary-scale traffic; move to
// Upstash/Supabase with an LRU only when hit-rate telemetry justifies it.
const activeLeases = new Map<string, DecisionLeaseRecord>();

export interface SessionSetupOptions {
    req: Request;
    maxRequestSizeBytes: number;
    surface: 'web' | 'api';
    rateLimitFeature?: 'ai' | 'query' | 'mutation' | 'webhook';
    strictValidation?: boolean;
    requestBody?: any;
}

export interface SessionSetupResult {
    errorResponse?: NextResponse;
    user?: any;
    clerkUser?: User;
    ip?: string;
    body?: any;
    resolvedContext?: RuntimeContextResult;
    requestPacket?: UcolRequestPacket;
    routingDecision?: UcolRoutingDecision;
}

export async function setupUcolSession({
    req,
    maxRequestSizeBytes,
    surface,
    rateLimitFeature = 'ai',
    strictValidation = false,
    requestBody,
}: SessionSetupOptions): Promise<SessionSetupResult> {
    const user = await requireAuth();
    const clerkUser = await currentUser();
    const ip = getClientIP(req);

    if (!clerkUser) {
        return { errorResponse: NextResponse.json({ error: 'User profile not found' }, { status: 401 }) };
    }

    const rateLimit = await limitApiEndpoint(user.userId, ip, rateLimitFeature);
    if (!rateLimit.success) {
        return {
            errorResponse: NextResponse.json(
                { error: 'Too many requests', message: 'AI generation rate limit exceeded. Please wait before trying again.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
                        'X-RateLimit-Limit': String(rateLimit.limit),
                        'X-RateLimit-Remaining': String(rateLimit.remaining),
                        'X-RateLimit-Reset': String(rateLimit.reset)
                    }
                }
            )
        };
    }

    const body = requestBody ?? await req.json();
    validateRequestSize(body, maxRequestSizeBytes);

    const rawInput = body.prompt || body.currentUserPrompt || '';
    const fileData = body.fileData as FileAttachmentInput | undefined;
    const messages = body.messages || [];

    if (rawInput && (typeof rawInput !== 'string' || rawInput.length > 50000)) {
        return { errorResponse: NextResponse.json({ error: 'Validation Error', details: 'Prompt must be a string up to 50,000 characters' }, { status: 400 }) };
    }

    if (messages && Array.isArray(messages) && messages.length > 100) {
        return { errorResponse: NextResponse.json({ error: 'Validation Error', details: 'Maximum 100 messages allowed in history' }, { status: 400 }) };
    }

    const conversationId = body.conversationId;
    const workspaceId = body.workspaceId;
    const operatingProfileId = body.operatingProfileId;
    const operatingProfileMode = body.operatingProfileMode;

    const resolvedContext = await resolveRuntimeContext({ 
        userId: user.userId, 
        surface, 
        conversationId, 
        workspaceId, 
        operatingProfileId, 
        fallbackMode: operatingProfileMode,
        strictValidation 
    });

    if (resolvedContext.error) {
        return { errorResponse: NextResponse.json({ error: resolvedContext.error.message }, { status: resolvedContext.error.status || 400 }) };
    }

    const requestPacket: UcolRequestPacket = {
        requestId: req.headers.get('x-request-id') || randomUUID(),
        userId: user.userId,
        workspaceId: resolvedContext.workspaceId || resolvedContext.ucolContext?.workspaceId || '',
        conversationId: resolvedContext.conversationId || conversationId,
        surface,
        rawInput,
        attachments: fileData ? [{
            id: 'primary-upload',
            type: 'document',
            mimeType: fileData.mimeType || fileData.type || 'text/plain',
            metadata: {
                providedByRoute: true,
                name: fileData.name,
                fileUri: fileData.fileUri,
                sizeBytes: fileData.sizeBytes,
                storageProvider: fileData.storageProvider,
            },
        }] : [],
        trustContext: {
            canUseExternalActions: false,
            canUseSensitiveTools: false,
            requestSourceTrust: 'direct_user',
        },
        createdAt: new Date().toISOString(),
    };

    let routingDecision = buildInitialRoutingDecision({
        request: requestPacket,
        context: resolvedContext.ucolContext,
        agentMode: resolvedContext.mode,
        signals: {
            hasAttachments: Boolean(fileData),
            messageHistoryCount: Array.isArray(messages) ? messages.length : 0,
            profile: resolvedContext.profile,
        },
    });

    // ── Slice 4: bounded routing canary ─────────────────────────────
    // Kill switch + frozen artifact + allowlist. Missing config → OFF.
    // ponytail: process.env read here (not env schema) — DECISION_CANARY_*
    // keys are optional operators' controls; adding them to the shared
    // lattice-core Env type couples an ops flag to a published package.
    const canaryConfigured = process.env.DECISION_CANARY_ENABLED === 'true';
    const canaryArtifactRaw = process.env.DECISION_CANARY_ARTIFACT_JSON;
    let canaryArtifact: CanaryPromotionArtifact | null = null;
    if (canaryConfigured && canaryArtifactRaw) {
        try {
            const parsed = JSON.parse(canaryArtifactRaw);
            canaryArtifact =
                parsed?.status === 'CANARY_ELIGIBLE' && parsed.datasetHash && parsed.policyId && parsed.policyVersion
                    ? parsed
                    : null;
        } catch { canaryArtifact = null; }
    }
    const canaryConfig: CanaryConfig = {
        enabled: canaryConfigured && canaryArtifact !== null,
        artifact: canaryArtifact,
        allowlist: (process.env.DECISION_CANARY_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        bucketPercent: Number(process.env.DECISION_CANARY_BUCKET_PERCENT ?? '0'),
        experimentVersion: process.env.DECISION_CANARY_EXPERIMENT_VERSION ?? 'canary-v1',
        semanticTierBudgetMs: Number(process.env.DECISION_CANARY_SEMANTIC_BUDGET_MS ?? '0'),
    };

    // B2 is already computed above (routingDecision). The canary may only
    // OVERRIDE a copy — never mutate the baseline object.
    const baselineTier: Tier = routingDecision.providerPlan.preferredModelRefs[0]?.split('.').pop() as Tier;
    const canaryFacts: CanaryRequestFacts = {
        requestId: requestPacket.requestId,
        cohortKey: resolvedContext.workspaceId || user.userId,
        hasAttachments: Boolean(fileData),
        requiresUserConfirmation: routingDecision.executionPlan.requiresUserConfirmation,
        destructiveOrExternalSideEffects: false, // B2 flags no such plans today; wire when it does
        deterministicRisk: 'unknown',
        supportedTiers: [],
        providerAvailable: true,
    };
    const canaryVerdict = authorizeCanary({ baselineTier, facts: canaryFacts, config: canaryConfig });

    // ── Slice 5: lease check BEFORE transport ────────────────────────
    // A valid lease lets the approved judgment skip the JEV call entirely.
    // Cache identity binds the full decision context (never the prompt).
    const leaseFp = leaseFingerprint({
        policyVersion: canaryConfig.artifact?.policyVersion ?? '',
        questionSetVersion: QUESTION_SET_VERSION,
        normalizedDossier: JSON.stringify(canarySemanticDossier(requestPacket.rawInput)),
        deterministicPolicyContext: JSON.stringify({ risk: canaryFacts.deterministicRisk, mode: resolvedContext.mode }),
        candidateSet: JSON.stringify(canaryFacts.supportedTiers),
    });
    const stateFp = JSON.stringify({ workspace: resolvedContext.workspaceId, turn: requestPacket.conversationId, attachments: canaryFacts.hasAttachments });
    const leaseCheck = checkLease({
        lease: requestPacket.conversationId ? activeLeases.get(requestPacket.conversationId) ?? null : null,
        decisionFingerprint: leaseFp,
        stateFingerprint: stateFp,
        policyVersion: canaryConfig.artifact?.policyVersion ?? '',
        now: new Date().toISOString(),
    });
    let activeLease: DecisionLeaseRecord | null = leaseCheck.lease;

    let canaryDecisionTier: unknown = null;
    let canaryDecisionLatencyMs = 0;
    let canaryServedRef: string | null = null;
    let canaryBaselineRef: string | null = null;
    if (canaryVerdict.eligible && leaseCheck.reusableTier !== null) {
        // Lease hit: reuse the previously validated judgment; no transport.
        canaryDecisionTier = leaseCheck.reusableTier;
        canaryDecisionLatencyMs = 0;
    } else if (canaryVerdict.eligible) {
        // Inline JEV transport under a strict deadline. Over budget,
        // malformed, or error → B2. No rescue, no chained fallback.
        const deadlineAt = Date.now() + canaryConfig.semanticTierBudgetMs;
        try {
            const started = Date.now();
            canaryDecisionTier = await Promise.race([
                canarySemanticTier(requestPacket.rawInput),
                new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error('canary_decision_timeout')), Math.max(deadlineAt - started, 0))
                ),
            ]);
            canaryDecisionLatencyMs = Date.now() - started;
        } catch {
            canaryDecisionTier = null; // any transport failure → B2
        }
    }

    const finalVerdict = validateCanaryDecision({
        verdict: canaryVerdict,
        facts: canaryFacts,
        semanticTier: canaryDecisionTier,
        decisionLatencyMs: canaryDecisionLatencyMs,
        semanticTierBudgetMs: canaryConfig.semanticTierBudgetMs,
    });

    if (finalVerdict.applied) {
        // Override a COPY of the routing decision — never the B2 baseline
        // object, which downstream telemetry and rollback still reference.
        const ref = finalVerdict.servedTier === 'fast' ? 'deepseek.fast'
            : finalVerdict.servedTier === 'reasoning' ? 'deepseek.reasoning'
            : 'deepseek.quality';
        const baselineModelRef = routingDecision.providerPlan.preferredModelRefs[0] ?? null;
        routingDecision = {
            ...routingDecision,
            providerPlan: { ...routingDecision.providerPlan, preferredModelRefs: [ref] },
            debug: {
                ...routingDecision.debug,
                policyFlags: [...(routingDecision.debug.policyFlags ?? []), `canary:${finalVerdict.policyId}@${finalVerdict.policyVersion}`],
            },
        };
        canaryServedRef = ref;
        canaryBaselineRef = baselineModelRef;

        // Slice 5: issue a user_turn lease on first apply within this
        // request; subsequent requests in the same conversation reuse it
        // and skip transport. Storage is the module-level map below.
        if (canaryConfig.artifact && leaseCheck.disposition === 'lease_miss') {
            activeLease = issueLease({
                requestId: requestPacket.requestId,
                policyId: canaryConfig.artifact.policyId,
                policyVersion: canaryConfig.artifact.policyVersion,
                decisionFingerprint: leaseFp,
                stateFingerprint: stateFp,
                kind: 'user_turn',
                proposedTier: finalVerdict.servedTier,
                now: new Date().toISOString(),
            });
        } else if (leaseCheck.lease && leaseCheck.disposition !== 'lease_miss') {
            activeLease = consumeLease(leaseCheck.lease);
        }
        if (activeLease && requestPacket.conversationId) {
            activeLeases.set(requestPacket.conversationId, activeLease);
        }
    }

    // Attribution telemetry — every intervention measurable (contract #5).
    // logEvent is synchronous fire-and-forget; isolate it so telemetry
    // failures can never touch routing.
    try {
        logEvent({
            eventType: 'decision_canary_event',
            userId: user.userId,
            workspaceId: resolvedContext.workspaceId || undefined,
            metadata: {
                requestId: requestPacket.requestId,
                canaryEligible: finalVerdict.eligible,
                canaryApplied: finalVerdict.applied,
                cohortId: finalVerdict.cohortId,
                policyId: finalVerdict.policyId,
                policyVersion: finalVerdict.policyVersion,
                promotionDatasetHash: finalVerdict.promotionDatasetHash,
                baselineTier: finalVerdict.baselineTier,
                proposedTier: finalVerdict.proposedTier,
                servedTier: finalVerdict.servedTier,
                baselineModelRef: canaryBaselineRef ?? routingDecision.providerPlan.preferredModelRefs[0] ?? null,
                servedModelRef: canaryServedRef ?? routingDecision.providerPlan.preferredModelRefs[0] ?? null,
                overrideReason: finalVerdict.overrideReason,
                fallbackReason: finalVerdict.fallbackReason,
                decisionLatencyMs: canaryDecisionLatencyMs,
                // Slice 5: lease/cache disposition with invalidation reasons.
                leaseDisposition: leaseCheck.disposition,
                leaseInvalidationReasons: leaseCheck.invalidationReasons,
            },
        });
    } catch { /* telemetry must never throw */ }

    // Shadow decision plane (slice 1A): the WHOLE operation (JEV request +
    // validation + telemetry write) is registered with waitUntil so Vercel
    // keeps the function alive until it completes. Routing is untouched.
    waitUntil(
      shadowEvaluateRouting({
        request: {
          requestId: requestPacket.requestId,
          rawInput: requestPacket.rawInput,
          userId: user.userId,
          workspaceId: resolvedContext.ucolContext.workspaceId ?? undefined,
        },
        productionDecision: routingDecision,
        agentMode: resolvedContext.mode,
        hasAttachments: Boolean(fileData),
        messageHistoryCount: Array.isArray(messages) ? messages.length : 0,
      })
    );

    console.info('[UCOL] Initial routing decision', {
        requestId: routingDecision.requestId,
        workspaceId: routingDecision.resolvedWorkspaceId,
        operatingProfileId: routingDecision.operatingProfileId,
        intent: routingDecision.intent,
        executionMode: routingDecision.executionPlan.mode,
        providerPlan: routingDecision.providerPlan,
        memoryPlan: routingDecision.memoryPlan,
        rationale: routingDecision.debug.rationale,
    });

    return {
        user,
        clerkUser,
        ip,
        body,
        resolvedContext,
        requestPacket,
        routingDecision,
    };
}
