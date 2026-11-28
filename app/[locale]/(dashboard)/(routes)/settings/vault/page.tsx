import { VaultManager } from './VaultManager';
import { Heading } from '@/components/heading';
import { Vault as VaultIcon } from 'lucide-react';
import { getVaultData } from '@/lib/conversations/vault';

export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  // Server prefetch mirrors /api/conversations/vault?filter=all — the client
  // island keeps filter/search interactions and re-fetches on filter change.
  const initialData = await getVaultData('all');

  return (
    <div>
      <Heading
        title="Vault"
        description="Your complete conversation history and media."
        icon={VaultIcon}
        iconColor="text-amber-600"
        bgColor="bg-amber-600/10"
      />
      <VaultManager initialData={initialData} />
    </div>
  );
}
