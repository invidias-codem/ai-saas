import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { getOwnedVideoJob, videoDb, VIDEO_BUCKET } from '@/lib/media/videoStore';
import { limitVideoRead } from '@/lib/media/videoReadAuth';
import { validateExternalUrl } from '@/lib/security/urlValidator';

export const runtime = 'nodejs';
export const maxDuration = 120;
const paramsSchema = z.object({ id: z.string().uuid(), mode: z.enum(['preview', 'download']) });
type Context = { params: Promise<{ id: string; mode: string }> };

async function serve(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitVideoRead(request, userId);
  if (limited) return limited;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return Response.json({ error: 'Video not found' }, { status: 404 });
  const { id, mode } = parsed.data;
  try {
    const job = await getOwnedVideoJob(userId, id, 'id');
    if (!job) return Response.json({ error: 'Video not found' }, { status: 404 });
    if (job.status !== 'succeeded' || !job.object_path || !job.byte_size) {
      return Response.json({ error: 'Video is not ready' }, { status: 409 });
    }
    const range = request.headers.get('range');
    if (range && (!/^bytes=\d*-\d*$/.test(range) || range === 'bytes=-')) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${job.byte_size}` } });
    }
    const { data, error } = await videoDb().storage.from(VIDEO_BUCKET).createSignedUrl(job.object_path, 120);
    if (error || !data) throw new Error('Video signing failed');
    const signed = new URL(data.signedUrl);
    if (!env.NEXT_PUBLIC_SUPABASE_URL || signed.origin !== new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin ||
        !signed.pathname.startsWith(`/storage/v1/object/sign/${VIDEO_BUCKET}/`) ||
        !(await validateExternalUrl(signed.href)).valid) throw new Error('Invalid storage delivery URL');
    const upstreamHeaders = new Headers();
    if (range) upstreamHeaders.set('Range', range);
    const ifRange = request.headers.get('if-range');
    if (ifRange) upstreamHeaders.set('If-Range', ifRange);
    const upstream = await fetch(signed.href, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers: upstreamHeaders,
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(90_000),
    });
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      throw new Error('Video storage unavailable');
    }
    const headers = new Headers({
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
      'Content-Disposition': `${mode === 'download' ? 'attachment' : 'inline'}; filename="lattice-video-${id}.mp4"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      Vary: 'Cookie, Authorization, Range',
    });
    for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
  } catch {
    console.error('[VIDEO_DELIVERY_FAILED]', id);
    return Response.json({ error: 'Video is temporarily unavailable. Please retry.' }, { status: 503 });
  }
}

export const GET = serve;
export const HEAD = serve;
