import { SignUp } from "@clerk/nextjs";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <SignUp 
      path={`/${locale}/sign-up`}
      appearance={{
        elements: {
          headerTitle: 'Join Lattice',
          headerSubtitle: 'Create your sovereign AI workspace',
        },
      }}
    />
  );
}