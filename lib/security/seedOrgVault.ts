import { supabaseAdmin } from '@/lib/supabaseClient';

interface SeedParams {
  orgId: string;
  shopDomain: string;
  storefrontToken: string;
}

export async function seedShopifyOrgVault({ orgId, shopDomain, storefrontToken }: SeedParams): Promise<{ shopDomain: boolean; storefrontToken: boolean }> {
  if (!supabaseAdmin) {
    throw new Error('Database configuration missing');
  }

  const admin = supabaseAdmin as NonNullable<typeof supabaseAdmin>;

  const results: { shopDomain: boolean; storefrontToken: boolean } = {
    shopDomain: false,
    storefrontToken: false,
  };

  const upsert = async (key: string, value: string): Promise<boolean> => {
    const { error } = await admin
      .from('organization_secrets')
      .upsert(
        { org_id: orgId, secret_key: key, secret_value: value },
        { onConflict: 'org_id, secret_key' }
      );

    return !error;
  };

  results.shopDomain = await upsert('SHOPIFY_SHOP_DOMAIN', shopDomain);
  results.storefrontToken = await upsert('SHOPIFY_STOREFRONT_TOKEN', storefrontToken);

  return results;
}
