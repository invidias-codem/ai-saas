// app/preview/share/[shareId]/page.tsx
// Phase 8D: Stable, Lattice-controlled share page for sandbox previews.
//
// Every request checks Clerk auth + preview ownership server-side. The
// sandbox is embedded in an iframe — the raw sandbox URL is never handed out
// as a shareable link. Consumers receive only the share link.
//
// Until Issue #479 enforcement exists, this page does NOT label the link as
// "private" or "revocable".
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    return redirect('/sign-in');
  }

  const { shareId: shareToken } = await params;

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/preview/share/${shareToken}`,
    {
      headers: {
        Authorization: `Bearer ${(await auth()).getToken?.() ?? ''}`,
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    return notFound();
  }

  const { sandboxUrl } = (await res.json()) as { sandboxUrl: string };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lattice Preview</title>
        <style>
          {`
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body { height: 100%; background: #0a0a0a; color: #e5e5e5;
              font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
              overflow: hidden; }
            #preview-frame { width: 100%; height: 100%; border: none; display: block; }
            #unsupported { display: none; padding: 2rem; text-align: center;
              color: #888; }
          `}
        </style>
      </head>
      <body>
        <iframe
          id="preview-frame"
          src={sandboxUrl}
          title="Lattice preview"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
        <div id="unsupported">
          Your browser cannot display this preview.
        </div>
      </body>
    </html>
  );
}
