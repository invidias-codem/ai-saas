import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { apiKey } = await req.json();
    if (!apiKey || typeof apiKey !== 'string') {
      return new NextResponse('Invalid API Key provided', { status: 400 });
    }

    // 1. Instant Validation (Fail Fast)
    const testClient = new OpenAI({ apiKey });
    try {
      await testClient.models.list();
    } catch (error) {
      return new NextResponse('Invalid OpenAI API Key', { status: 400 });
    }

    // 2. Insert into Supabase Vault securely
    const secretName = `openai_key_${userId}`;
    const secretDescription = `OpenAI API Key for user ${userId}`;
    
    // Check if user already has a secret mapped
    const { data: existingMapping } = await supabaseAdmin
      .from('user_api_keys')
      .select('secret_id')
      .eq('user_id', userId)
      .single();

    let secretId;

    if (existingMapping) {
      // Update existing secret in vault
      const { data: updatedSecret, error: vaultError } = await supabaseAdmin.rpc(
        'update_secret', 
        { secret_id: existingMapping.secret_id, new_secret: apiKey }
      );
      if (vaultError) throw vaultError;
      secretId = existingMapping.secret_id;
    } else {
      // Insert new secret into vault
      const { data: newSecret, error: vaultError } = await supabaseAdmin.rpc(
        'insert_secret',
        { secret: apiKey, name: secretName, description: secretDescription }
      );
      if (vaultError) throw vaultError;
      secretId = newSecret;

      // Create the mapping
      await supabaseAdmin
        .from('user_api_keys')
        .insert({ user_id: userId, secret_id: secretId });
    }

    return NextResponse.json({ success: true, message: 'API Key securely stored.' });

  } catch (error) {
    console.error('[API_KEY_UPSERT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { data: existingMapping } = await supabaseAdmin
      .from('user_api_keys')
      .select('secret_id')
      .eq('user_id', userId)
      .single();

    return NextResponse.json({ configured: !!existingMapping });
  } catch (error) {
    console.error('[API_KEY_CHECK]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
