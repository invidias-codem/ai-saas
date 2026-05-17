import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'api');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { deviceId, query, surface = 'desktop' } = body;

    if (!deviceId || !query) {
      return NextResponse.json({ error: 'deviceId and query are required' }, { status: 400 });
    }

    // 1. Create a Relay Session
    const sessionId = uuidv4();
    if (supabaseAdmin) {
      const { error: sessionError } = await supabaseAdmin
        .from('relay_sessions')
        .insert({
          id: sessionId,
          user_id: user.userId,
          device_id: deviceId,
          task_description: query,
          status: 'active',
          // raw_trajectory and response_summary will be populated later by background logic
        });

      if (sessionError) {
        logger.error('[Relay Intent] Failed to create session:', sessionError);
        return NextResponse.json({ error: 'Failed to initialize session' }, { status: 500 });
      }
    }

    // 2. Perform UCOL Routing Decision
    const routingDecision = buildInitialRoutingDecision({
      request: {
        requestId: sessionId,
        rawInput: query,
        userId: user.userId,
        surface: surface as any,
        createdAt: new Date().toISOString(),
      },
      context: {
        surface: surface as any,
        preWorkspace: true,
        workspaceBacked: false,
        operatingProfileResolved: false,
        allowedMemoryScopes: ['user', 'conversation']
      },
      agentMode: 'agentic',
    });

    logger.debug(`[Relay Intent] Routing decision for ${sessionId}: ${routingDecision.intent.category}`);

    // 3. Dispatch to React Loop / Skill Matching
    // TODO: In a full production setup, this would publish to a queue (e.g. Inngest) 
    // or trigger an async serverless function to run the agent loop without blocking the client.
    // For now, we will just return the session/task ID to the client. The client will poll or subscribe.
    
    return NextResponse.json({
      taskId: sessionId,
      status: 'queued',
      intent: routingDecision.intent.category,
      confidence: routingDecision.intent.confidence
    });

  } catch (error: any) {
    logger.error("[Relay Intent API Error]", error);
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
