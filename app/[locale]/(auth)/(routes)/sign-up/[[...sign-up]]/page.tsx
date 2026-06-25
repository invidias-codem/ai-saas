import WebviewAwareAuth from '../../../webview-auth';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <WebviewAwareAuth
      locale={locale}
      path={`/${locale}/sign-up`}
      appearance={{
        elements: {
          logoImage: '/Genie.png',
          headerTitle: 'Join Lattice',
          headerSubtitle: 'Create your sovereign AI workspace',
        },
      }}
    />
  );
}
