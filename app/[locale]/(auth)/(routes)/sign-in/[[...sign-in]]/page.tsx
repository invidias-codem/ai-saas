import WebviewAwareAuth from '../../../webview-auth';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <WebviewAwareAuth
      locale={locale}
      path={`/${locale}/sign-in`}
      appearance={{
        elements: {
          headerTitle: 'Sign in to Lattice',
          headerSubtitle: 'Access your sovereign AI workspace',
        },
      }}
    />
  );
}
