/**
 * Vault API Route
 * 
 * GET /api/conversations/vault?filter=all|active|archived|deleted
 * Returns ALL conversations including deleted ones for the Vault view
 */

import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getVaultData } from '@/lib/conversations/vault';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export type { VaultConversation } from '@/lib/conversations/vault';

export async function GET(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const { searchParams } = new URL(req.url);
        const filter = searchParams.get('filter') || 'all';

        const filterSchema = z.enum(['all', 'active', 'archived', 'deleted']);
        const filterValidation = filterSchema.safeParse(filter);
        if (!filterValidation.success) {
            return NextResponse.json({ error: 'Invalid filter parameter' }, { status: 400 });
        }

        const data = await getVaultData(filterValidation.data);
        return NextResponse.json(data);
    } catch (error) {
        console.error("[API:Vault] Error:", error);

        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
