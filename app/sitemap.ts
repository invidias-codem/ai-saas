import { MetadataRoute } from 'next';
import { getTopPublicAgents } from '@/lib/agents';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://gen1e.xyz';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    let agents: Awaited<ReturnType<typeof getTopPublicAgents>> = [];

    try {
        agents = await getTopPublicAgents(100);
    } catch (error) {
        console.error('[Sitemap] Failed to fetch agents:', error);
    }

    const agentUrls = agents.map((agent: any) => ({
        url: `${BASE_URL}/agent/${agent.id}`,
        lastModified: new Date(agent.updated_at || new Date()),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    }));

    return [
        {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        ...agentUrls,
    ];
}
