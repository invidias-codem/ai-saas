import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';

export const dynamic = 'force-dynamic';

interface ConsultantProfile {
  id: string;
  title: string;
  domain: string;
  mode: 'analytical' | 'creative' | 'technical' | 'strategic' | 'custom';
  description?: string;
  proprietary_base?: string[];
}

// ---------------------------------------------------------------------------
// Minimal consultant lookup. Replace with Supabase fetch when the
// `consultant_profiles` table is ready.
// ---------------------------------------------------------------------------
const CONSULTANT_BY_ID: Record<string, ConsultantProfile> = {
  'technical-apparel': {
    id: 'technical-apparel',
    title: 'Technical Apparel Consultant',
    domain: 'Technical Apparel Manufacturing',
    mode: 'technical',
    description: 'Expert in dimensional puff-print graphics, tech packs, and loopwheel cotton specifications.',
    proprietary_base: [
      'Global Textile Sourcing',
      'Hardware & Zippers',
      'Heavy-weight Cut & Sew',
    ],
  },
  'default': {
    id: 'default',
    title: 'Domain Expert',
    domain: 'General Advisory',
    mode: 'analytical',
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const profile = CONSULTANT_BY_ID[id] || CONSULTANT_BY_ID['default'];

    return NextResponse.json({ success: true, consultant: profile });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:Expert:GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
