import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

export default async function RelayAdminLayout({ children }: { children: ReactNode }) {
  const { userId, sessionClaims } = await auth();

  const isAdmin = (sessionClaims?.metadata as any)?.role === 'admin';

  if (!userId || !isAdmin) {
    redirect('/weaver');
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
