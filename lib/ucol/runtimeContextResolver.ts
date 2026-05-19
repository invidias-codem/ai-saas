import { supabaseAdmin } from '@/lib/supabaseClient';
import { resolveAgentModeFromProfile } from '@/lib/workspaces/runtimeMode';
import type { AgentMode } from '@/lib/llm/types';
import type { RuntimeProfileSignals, OperatingProfileMode } from '@/lib/workspaces/runtimeMode';
import type { UcolResolvedContext, UcolSurface } from '@/lib/ucol/routing/types';

export interface RuntimeContextInput {
    userId: string;
    surface: UcolSurface;
    conversationId?: string | null;
    workspaceId?: string | null;
    operatingProfileId?: string | null;
    fallbackMode?: string | null;
    strictValidation?: boolean;
}

export interface RuntimeContextResult {
    error?: {
        status: number;
        message: string;
        code: 'NOT_FOUND' | 'MISMATCH' | 'DB_ERROR'
    };
    conversationId?: string;
    workspaceId?: string;
    operatingProfileId?: string;
    operatingProfileName?: string;
    profile: RuntimeProfileSignals | null;
    mode: AgentMode;
    ucolContext: UcolResolvedContext;
}

export async function resolveRuntimeContext(input: RuntimeContextInput): Promise<RuntimeContextResult> {
    const { userId, surface, fallbackMode, strictValidation } = input;
    let { conversationId, workspaceId, operatingProfileId } = input;
    
    let conversation: any = null;

    if (!supabaseAdmin) {
        const err = { status: 500, message: 'Database configuration missing', code: 'DB_ERROR' as const };
        if (strictValidation) {
            return { error: err, profile: null, mode: 'quality', ucolContext: _buildFallbackContext(input) };
        }
        // Proceed with graceful degradation if not strict
    } else if (conversationId) {
        const { data, error } = await supabaseAdmin
            .from('conversations')
            .select('id, user_id, workspace_id, operating_profile_id, is_deleted')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
             if (strictValidation) return { error: { status: 500, message: 'Database error', code: 'DB_ERROR' }, profile: null, mode: 'quality', ucolContext: _buildFallbackContext(input) };
        } else if (!data || data.is_deleted) {
             if (strictValidation) return { error: { status: 404, message: 'Conversation not found', code: 'NOT_FOUND' }, profile: null, mode: 'quality', ucolContext: _buildFallbackContext(input) };
        } else {
             conversation = data;
             
             // Validate mismatches if strict
             if (strictValidation) {
                 if (workspaceId && conversation.workspace_id && conversation.workspace_id !== workspaceId) {
                     return { error: { status: 409, message: 'Conversation/workspace mismatch', code: 'MISMATCH' }, profile: null, mode: 'quality', ucolContext: _buildFallbackContext(input) };
                 }
                 if (operatingProfileId && conversation.operating_profile_id && conversation.operating_profile_id !== operatingProfileId) {
                     return { error: { status: 409, message: 'Conversation/profile mismatch', code: 'MISMATCH' }, profile: null, mode: 'quality', ucolContext: _buildFallbackContext(input) };
                 }
             }
             
             // Inherit from conversation if not explicitly provided
             if (!workspaceId && conversation.workspace_id) {
                 workspaceId = conversation.workspace_id;
             }
             if (!operatingProfileId && conversation.operating_profile_id) {
                 operatingProfileId = conversation.operating_profile_id;
             }
        }
    }
    
    let workspaceDefaultProfileId: string | null = null;
    if (!operatingProfileId && workspaceId && supabaseAdmin) {
        const { data: workspace } = await supabaseAdmin
            .from('workspaces')
            .select('default_operating_profile_id')
            .eq('id', workspaceId)
            .eq('user_id', userId)
            .maybeSingle();

        workspaceDefaultProfileId = workspace?.default_operating_profile_id ?? null;
        operatingProfileId = workspaceDefaultProfileId;
    }

    let operatingProfile: any = null;
    if (operatingProfileId && supabaseAdmin) {
        const { data } = await supabaseAdmin
            .from('operating_profiles')
            .select('id, name, mode, latency_preference, allow_agentic_runs, tool_use_level, retrieval_depth, default_output_style')
            .eq('id', operatingProfileId)
            .eq('user_id', userId)
            .maybeSingle();
        operatingProfile = data;
    }

    const normalizedFallbackMode = (['copilot', 'research', 'agentic', 'drafting', 'memory_native', 'custom'] as const).includes(fallbackMode as any)
      ? (fallbackMode as OperatingProfileMode)
      : null;

    const resolvedProfile = operatingProfile
      ? {
          id: operatingProfile.id ?? null,
          name: operatingProfile.name ?? null,
          mode: operatingProfile.mode ?? null,
          latency_preference: operatingProfile.latency_preference ?? null,
          allow_agentic_runs: operatingProfile.allow_agentic_runs ?? null,
          tool_use_level: operatingProfile.tool_use_level ?? null,
          retrieval_depth: operatingProfile.retrieval_depth ?? null,
          default_output_style: operatingProfile.default_output_style ?? null,
        }
      : normalizedFallbackMode
        ? { mode: normalizedFallbackMode }
        : null;

    const mode = resolveAgentModeFromProfile(resolvedProfile as any);

    return {
        conversationId: conversationId || undefined,
        workspaceId: workspaceId || undefined,
        operatingProfileId: operatingProfile?.id || undefined,
        operatingProfileName: operatingProfile?.name || undefined,
        profile: resolvedProfile as RuntimeProfileSignals | null,
        mode,
        ucolContext: {
            workspaceId: workspaceId || undefined,
            operatingProfileId: operatingProfile?.id || undefined,
            conversationId: conversationId || undefined,
            surface,
            preWorkspace: !workspaceId,
            workspaceBacked: Boolean(workspaceId),
            operatingProfileResolved: Boolean(operatingProfile?.id || resolvedProfile),
            allowedMemoryScopes: workspaceId ? ['conversation', 'workspace', 'user'] : ['conversation', 'user'],
            notes: [
                operatingProfile?.id ? 'database profile resolved' : (resolvedProfile ? 'fallback profile mode resolved' : 'no profile resolved'),
                workspaceDefaultProfileId ? 'workspace default profile fallback used' : 'no workspace default fallback needed',
            ],
        }
    };
}

function _buildFallbackContext(input: RuntimeContextInput): UcolResolvedContext {
    return {
        workspaceId: input.workspaceId || undefined,
        operatingProfileId: input.operatingProfileId || undefined,
        conversationId: input.conversationId || undefined,
        surface: input.surface,
        preWorkspace: !input.workspaceId,
        workspaceBacked: Boolean(input.workspaceId),
        operatingProfileResolved: false,
        allowedMemoryScopes: input.workspaceId ? ['conversation', 'workspace', 'user'] : ['conversation', 'user'],
        notes: ['Validation failed, returning fallback context'],
    };
}
