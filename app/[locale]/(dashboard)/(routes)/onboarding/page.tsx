import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getDefaultWorkspace } from '@/lib/workspaces/defaultWorkspace';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string }>;
}

export default async function OnboardingPage({ params }: RouteParams) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  // E1/E4: server gate. Returning users skip the wizard entirely.
  // getDefaultWorkspace() may auto-create a starter workspace for fresh
  // users — that's exactly the branch we let through to the wizard.
  const workspace = await getDefaultWorkspace(userId);

  // Only 'starter' still needs onboarding. Everything else (configured,
  // completed, any future terminal state) goes straight to the workspace.
  if (workspace.onboarding_state && workspace.onboarding_state !== 'starter') {
    redirect(`/${locale}/workspaces/${workspace.id}/conversation`);
  }

  return <OnboardingWizard />;
}
