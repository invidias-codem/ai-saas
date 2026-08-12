import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  deleteUserProviderApiKey,
  getConfiguredProviderKeys,
  isProviderName,
  ProviderName,
  upsertUserProviderApiKey,
} from '@/lib/userProviderKeys';

type ProviderPayload = {
  provider?: string;
  apiKey?: string;
};

function validateKeyShape(provider: ProviderName, apiKey: string | null) {
  if (!apiKey) return 'API key is required.';
  if (provider === 'openai' && !(apiKey.startsWith('sk-') || apiKey.startsWith('proj-'))) {
    return 'Invalid OpenAI API key format.';
  }
  if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
    return 'Invalid Anthropic API key format.';
  }
  if (provider === 'google' && !apiKey.startsWith('AIza')) {
    return 'Invalid Google API key format.';
  }
  if (provider === 'huggingface' && !apiKey.startsWith('hf_')) {
    return 'Invalid Hugging Face API key format.';
  }
  return null;
}

async function validateProviderKey(provider: ProviderName, apiKey: string): Promise<void> {
  if (provider === 'openai') {
    const client = new OpenAI({ apiKey });
    await client.models.list();
    return;
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return;
  }

  if (provider === 'huggingface') {
    const client = new OpenAI({ apiKey, baseURL: 'https://router.huggingface.co/v1' });
    await client.chat.completions.create({
      model: 'openai/gpt-oss-120b:fastest',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 1,
    });
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: 'Return the word pong.' }] }],
    generationConfig: { maxOutputTokens: 4, temperature: 0 },
  });
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const providers = await getConfiguredProviderKeys(userId);
    return NextResponse.json({ providers, configured: providers.openai.configured || providers.huggingface.configured });
  } catch (error) {
    console.error('[PROVIDER_KEYS_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { provider: rawProvider = 'openai', apiKey }: ProviderPayload = await req.json();
    if (!isProviderName(rawProvider)) {
      return new NextResponse('Unsupported provider', { status: 400 });
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return new NextResponse('Invalid API key provided', { status: 400 });
    }

    const shapeError = validateKeyShape(rawProvider, apiKey);
    if (shapeError) return new NextResponse(shapeError, { status: 400 });

    try {
      await validateProviderKey(rawProvider, apiKey);
    } catch (error) {
      console.warn(`[PROVIDER_KEY_VALIDATE:${rawProvider}]`, error);
      return new NextResponse(`Invalid ${rawProvider} API key`, { status: 400 });
    }

    await upsertUserProviderApiKey({ userId, provider: rawProvider, apiKey });

    return NextResponse.json({ success: true, providers: await getConfiguredProviderKeys(userId) });
  } catch (error) {
    console.error('[PROVIDER_KEYS_UPSERT]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const rawProvider = searchParams.get('provider') || 'openai';
    if (!isProviderName(rawProvider)) {
      return new NextResponse('Unsupported provider', { status: 400 });
    }

    await deleteUserProviderApiKey(userId, rawProvider);
    return NextResponse.json({ success: true, providers: await getConfiguredProviderKeys(userId) });
  } catch (error) {
    console.error('[PROVIDER_KEYS_DELETE]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
