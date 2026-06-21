import { SignIn } from "@clerk/nextjs";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <SignIn 
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


