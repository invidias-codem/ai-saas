import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

// Simple in-memory client registry.
// In production this would be Supabase / Redis / Postgres.
const registeredClients = new Map<string, {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  name: string;
  created_at: number;
}>();

const RegisterRequestSchema = z.object({
  client_name: z.string().min(1),
  redirect_uris: z.array(z.string().url()).nonempty(),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — sign in with Clerk first' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  const { client_name, redirect_uris } = parsed.data;
  const clientId = `lattice_${randomUUID().replace(/-/g, '')}`;
  const clientSecret = randomUUID();

  registeredClients.set(clientId, {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris,
    name: client_name,
    created_at: Date.now(),
  });

  // Return per RFC 7591 / 8631 dynamic client registration
  return NextResponse.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris,
      client_name,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201 }
  );
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clients = Array.from(registeredClients.values()).map((c) => ({
    client_id: c.client_id,
    name: c.name,
    redirect_uris: c.redirect_uris,
    created_at: c.created_at,
  }));

  return NextResponse.json({ clients });
}
