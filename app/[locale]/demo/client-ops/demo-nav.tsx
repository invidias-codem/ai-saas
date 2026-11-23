// app/[locale]/demo/client-ops/demo-nav.tsx
// Shared navigation for the C1 demo UI screens.
// Links between the five demo screens; all owner-only, synthetic-only.
// Preserves locale and workspaceId across screen transitions.

import Link from 'next/link';

const screens = [
  { href: 'overview', label: 'Engagement', icon: '📋' },
  { href: 'checklist', label: 'Checklist', icon: '📄' },
  { href: 'evidence', label: 'Evidence', icon: '🔍' },
  { href: 'uncertainty', label: 'Uncertainty', icon: '⚠️' },
  { href: 'approval', label: 'Follow-Up Draft', icon: '✍️' },
] as const;

interface DemoNavProps {
  current: string;
  locale: string;
  workspaceId: string;
}

export function DemoNav({ current, locale, workspaceId }: DemoNavProps) {
  return (
    <nav
      aria-label="Demo screens"
      className="flex flex-col gap-1 md:flex md:flex-row md:gap-2"
    >
      {screens.map((screen) => {
        const url = new URL(
          `/${locale}/demo/client-ops/${screen.href}`,
          'http://localhost'
        );
        url.searchParams.set('workspaceId', workspaceId);
        return (
          <Link
            key={screen.href}
            href={url.toString()}
            aria-current={current === screen.href ? 'page' : undefined}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              current === screen.href
                ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/30'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`}
          >
            <span>{screen.icon}</span>
            <span>{screen.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
