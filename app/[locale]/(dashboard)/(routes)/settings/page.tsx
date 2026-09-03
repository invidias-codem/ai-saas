import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Heading } from '@/components/heading';
import { Archive, Settings, Database, Mail, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { db } from '@/lib/firebaseAdmin';
import { getUserCredits } from '@/lib/subscription/credits';
import { hasUnlimitedUsageAccess } from '@/lib/credits';
import { getConfiguredProviderKeys } from '@/lib/userProviderKeys';
import { SlackIntegration } from '@/components/slack-integration';
import { MembershipSection } from './MembershipSection';
import { CreditsSection } from './CreditsSection';
import { DigestToggleSection } from './DigestToggleSection';
import { ProviderKeysSection } from './ProviderKeysSection';
import { IntegrationsSection } from './IntegrationsSection';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string }>;
}

function SlackIntegrationSkeleton() {
  return (
    <Card className="p-6 border-black/5">
      <div className="flex items-center gap-3">
        <div className="animate-pulse bg-gray-200 rounded-lg w-10 h-10" />
        <div className="space-y-2 flex-1">
          <div className="animate-pulse bg-gray-200 rounded h-4 w-32" />
          <div className="animate-pulse bg-gray-200 rounded h-3 w-48" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    </Card>
  );
}

export default async function SettingsPage({ params }: RouteParams) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  // All initial data fetched in parallel — replaces four independent
  // post-hydration client waterfalls.
  const [
    credits,
    hasPlan,
    digestRow,
    providerKeys,
    githubRow,
    trelloRow,
  ] = await Promise.all([
    getUserCredits(userId).catch(() => 0),
    hasUnlimitedUsageAccess(userId).catch(() => false),
    supabaseAdmin
      ? supabaseAdmin
          .from('user_settings')
          .select('daily_digest_enabled')
          .eq('user_id', userId)
          .maybeSingle()
          .then((r) => r.data, () => null)
      : Promise.resolve(null),
    getConfiguredProviderKeys(userId).catch(() => null),
    supabaseAdmin
      ? supabaseAdmin
          .from('user_integrations')
          .select('is_connected, access_token_encrypted, metadata')
          .eq('user_id', userId)
          .eq('service_name', 'github')
          .maybeSingle()
          .then((r) => r.data, () => null)
      : Promise.resolve(null),
    db
      ? db
          .collection('users')
          .doc(userId)
          .collection('integrations')
          .doc('trello')
          .get()
          .then((doc) => doc.data() ?? null, () => null)
      : Promise.resolve(null),
  ]);

  // Membership: match /api/plan/check semantics (hasUnlimitedUsageAccess) and
  // surface premium_until when present.
  let premiumUntil: string | null = null;
  if (supabaseAdmin) {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('tier, premium_until')
      .eq('clerk_user_id', userId)
      .maybeSingle();
    premiumUntil = sub?.premium_until ?? null;
  }

  const githubStatus = {
    connected: githubRow?.is_connected === true && !!githubRow?.access_token_encrypted,
    username: (githubRow?.metadata as any)?.github_login ?? null,
    email: (githubRow?.metadata as any)?.github_email ?? null,
  };
  const trelloStatus = {
    connected: trelloRow?.isConnected === true && !!trelloRow?.accessToken,
    username: trelloRow?.username ?? null,
  };

  return (
    <div>
      <Heading
        title="Settings"
        description="Manage your account settings, integrations, and memories."
        icon={Settings}
        iconColor="text-gray-700"
        bgColor="bg-gray-700/10"
      />

      <div className="px-4 lg:px-8 space-y-6 pb-20 md:pb-0">
        <CreditsSection initialCredits={credits} />

        <MembershipSection
          initialPlan={hasPlan ? 'pro' : 'free'}
          initialPremiumUntil={premiumUntil}
        />

        {userId && (
          <Suspense fallback={<SlackIntegrationSkeleton />}>
            <SlackIntegration userId={userId} />
          </Suspense>
        )}

        {/* Vault — server-rendered nav link */}
        <Card className="p-6 border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-600/10">
                <Archive className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Vault</h3>
                <p className="text-sm text-muted-foreground">
                  Access all your conversations, archives, and deleted items
                </p>
              </div>
            </div>
            <Link
              href={`/${locale}/settings/vault`}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white transition-colors"
            >
              Open Vault
            </Link>
          </div>
        </Card>

        {/* Data & Memory — server-rendered nav link */}
        <Card className="p-6 border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-700/10">
                <Database className="w-6 h-6 text-pink-700" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Data &amp; Memory</h3>
                <p className="text-sm text-muted-foreground">
                  Import chat history, manage memory bank, and export your data
                </p>
              </div>
            </div>
            <Link
              href={`/${locale}/settings/data`}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-pink-700 hover:bg-pink-800 text-white transition-colors"
            >
              Manage Data
            </Link>
          </div>
        </Card>

        <Card className="p-6 border-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <Mail className="w-6 h-6 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Daily Briefing</h3>
                <p className="text-sm text-muted-foreground">
                  Receive a daily email summary of your key insights and action items
                </p>
              </div>
            </div>
            <DigestToggleSection initialEnabled={digestRow?.daily_digest_enabled ?? false} />
          </div>
        </Card>

        <ProviderKeysSection initialKeys={providerKeys} />

        <IntegrationsSection initialGithub={githubStatus} initialTrello={trelloStatus} />
      </div>
    </div>
  );
}
