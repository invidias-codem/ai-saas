// app/[locale]/(dashboard)/(routes)/previews/[previewId]/page.tsx
// Phase 8D: Owner-only preview UI for sandbox previews.
//
// Shows Preview / Code / Logs tabs for a completed build. Owner-only —
// the viewer must be the preview's creator. Public sharing and the
// production sandbox flag remain disabled until Issue #479 is resolved.
//
// Access path: /[locale]/previews/[previewId]
import PreviewOwnerClient from './client';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string; previewId: string }>;
}

interface PreviewRow {
  id: string;
  build_id: string;
  user_id: string;
  sandbox_id?: string | null;
  sandbox_url?: string | null;
  status: string;
  expires_at?: string | null;
}

interface BuildRow {
  build_id: string;
  user_id: string;
  workspace_id?: string | null;
  status: string;
  phase?: string | null;
  progress?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  files_json?: unknown;
  plan_json?: unknown;
}

export default async function PreviewOwnerPage({ params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return redirect(`/${(await params).locale}/sign-in`);
  }

  const { previewId } = await params;

  if (!supabaseAdmin) {
    return notFound();
  }

  // Fetch preview sandbox record.
  const { data: preview, error: previewError } = await supabaseAdmin
    .from('preview_sandboxes')
    .select('*')
    .eq('id', previewId)
    .maybeSingle();

  if (previewError || !preview) {
    return notFound();
  }

  // Owner-only: viewer must be the preview creator.
  if ((preview as PreviewRow).user_id !== userId) {
    return notFound();
  }

  // Fetch the build record for generated files + lifecycle diagnostics.
  const { data: build } = await supabaseAdmin
    .from('code_builder_builds')
    .select('*')
    .eq('build_id', (preview as PreviewRow).build_id)
    .maybeSingle();

  // Defense in depth: never expose one owner's build to another preview record.
  if (!build || (build as BuildRow).user_id !== userId) return notFound();

  return (
    <PreviewOwnerClient
      previewId={(preview as PreviewRow).id}
      buildId={(preview as PreviewRow).build_id}
      previewStatus={(preview as PreviewRow).status}
      sandboxUrl={(preview as PreviewRow).sandbox_url ?? undefined}
      expiresAt={(preview as PreviewRow).expires_at ?? undefined}
      build={(build as BuildRow | null) ?? null}
    />
  );
}
