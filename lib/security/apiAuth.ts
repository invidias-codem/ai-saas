// lib/security/apiAuth.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

/**
 * Authentication error response
 */
export class AuthenticationError extends Error {
    constructor(message: string = 'Unauthorized') {
        super(message);
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization error response (authenticated but not allowed)
 */
export class AuthorizationError extends Error {
    constructor(message: string = 'Forbidden') {
        super(message);
        this.name = 'AuthorizationError';
    }
}

/**
 * User context from authentication
 */
export interface AuthenticatedUser {
    userId: string;
}

/**
 * Require valid authentication token
 * Returns user context or throws AuthenticationError
 * 
 * @example
 * const user = await requireAuth();
 * console.log(user.userId);
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
    const { userId } = await auth();

    if (!userId) {
        throw new AuthenticationError('Authentication required');
    }

    return { userId };
}

/**
 * Validate that the authenticated user owns the specified resource
 * 
 * @param userId - The authenticated user ID
 * @param resourceId - The resource ID to check ownership for
 * @param tableName - The Supabase table name (e.g., 'conversations', 'messages')
 * @param userIdColumn - The column name that stores the user ID (defaults to 'user_id')
 * 
 * @throws AuthorizationError if user doesn't own the resource
 * @throws Error if database query fails
 * 
 * @example
 * await requireOwnership(user.userId, conversationId, 'conversations');
 */
export async function requireOwnership(
    userId: string,
    resourceId: string,
    tableName: string,
    userIdColumn: string = 'user_id'
): Promise<void> {
    if (!supabaseAdmin) {
        console.error('[AUTH] Supabase not configured - cannot verify ownership');
        throw new AuthorizationError('Authorization service unavailable');
    }

    const { data, error } = await supabaseAdmin
        .from(tableName)
        .select(userIdColumn)
        .eq('id', resourceId)
        .single();

    if (error || !data) {
        throw new AuthorizationError('Resource not found or access denied');
    }

    // Type assertion for dynamic column access - narrow through unknown
    const record = data as unknown as Record<string, string>;
    const userIdValue = record[userIdColumn];

    if (userIdValue !== userId) {
        console.warn(`[AUTH] User ${userId} attempted to access ${tableName}/${resourceId} owned by ${userIdValue}`);
        throw new AuthorizationError('You do not have permission to access this resource');
    }
}

/**
 * Handle authentication/authorization errors and return appropriate response
 * 
 * @example
 * try {
 *   const user = await requireAuth();
 *   // ... protected logic
 * } catch (error) {
 *   return handleAuthError(error);
 * }
 */
export function handleAuthError(error: unknown): NextResponse {
    if (error instanceof AuthenticationError) {
        return NextResponse.json(
            { error: 'Unauthorized', message: error.message },
            { status: 401 }
        );
    }

    if (error instanceof AuthorizationError) {
        return NextResponse.json(
            { error: 'Forbidden', message: error.message },
            { status: 403 }
        );
    }

    // Re-throw if not an auth error
    throw error;
}

/**
 * Extract IP address from request
 * Handles various proxy headers (Vercel, Cloudflare, etc.)
 */
export function getClientIP(req: Request): string {
    if (!req || !req.headers || typeof req.headers.get !== 'function') {
        return 'unknown';
    }

    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIP = req.headers.get('x-real-ip');
    if (realIP) {
        return realIP;
    }

    const cfConnectingIP = req.headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
        return cfConnectingIP;
    }

    // Fallback for development
    return 'unknown';
}
