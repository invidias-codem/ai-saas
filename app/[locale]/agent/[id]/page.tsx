import { Metadata } from 'next';
import { getPublicAgent } from '@/lib/agents';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    const agent = await getPublicAgent(id);
    if (!agent) return {};

    const displayName = agent.name?.trim() || 'Unnamed Agent';
    const truncatedName = displayName.length > 100 ? displayName.substring(0, 100) + '...' : displayName;

    return {
        title: `${displayName} - AI Agent | Gen1e`,
        description: agent.description || 'An AI agent powered by Gen1e',
        openGraph: {
            title: displayName,
            description: agent.description || 'An AI agent powered by Gen1e',
            images: [{ url: `/api/og?title=${encodeURIComponent(truncatedName)}` }],
        },
        twitter: {
            card: 'summary_large_image',
        }
    };
}

export default async function AgentPage({ params }: Props) {
    const { id } = await params;
    const agent = await getPublicAgent(id);

    if (!agent) {
        notFound();
    }

    // Sanitize user-controlled strings for JSON-LD
    const sanitize = (str: string) => str.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: sanitize(agent.name),
        description: sanitize(agent.description || ''),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
        ...(agent.usage_count > 0 && {
            aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: agent.usage_count,
            },
        }),
    };

    return (
        <div className="min-h-screen bg-black text-white p-8 font-sans">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <main className="max-w-4xl mx-auto space-y-12">
                {/* Hero Section */}
                <section className="text-center space-y-6 pt-12">
                    <div className="w-24 h-24 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center text-4xl shadow-2xl shadow-indigo-500/30">
                        {agent.name.charAt(0)}
                    </div>

                    <h1 className="text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                        {agent.name}
                    </h1>

                    <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        {agent.description}
                    </p>

                    <div className="flex justify-center gap-4 pt-4">
                        <Link href={`/dashboard/conversation?agent=${agent.id}`}>
                            <Button className="bg-white text-black hover:bg-gray-200 text-lg px-8 py-6 rounded-full font-bold transition-all transform hover:scale-105 shadow-xl">
                                Trying {agent.name} Now →
                            </Button>
                        </Link>
                    </div>
                </section>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-2xl">
                        <div className="text-gray-500 text-sm uppercase tracking-wider">Usage</div>
                        <div className="text-3xl font-bold mt-2">{agent.usage_count.toLocaleString()} runs</div>
                    </div>
                    <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-2xl">
                        <div className="text-gray-500 text-sm uppercase tracking-wider">Creator</div>
                        <div className="text-3xl font-bold mt-2">{agent.creator_name}</div>
                    </div>
                    {agent.usage_count > 10 && (
                        <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-2xl">
                            <div className="text-gray-500 text-sm uppercase tracking-wider">Popularity</div>
                            <div className="text-3xl font-bold mt-2">
                                {agent.usage_count > 1000 ? 'Very Popular' : agent.usage_count > 100 ? 'Popular' : 'Growing'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Capabilities */}
                <section>
                    <h2 className="text-2xl font-bold mb-6">Capabilities</h2>
                    <div className="flex flex-wrap gap-3">
                        {agent.capabilities.map((cap) => (
                            <span key={cap} className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300">
                                {cap}
                            </span>
                        ))}
                        {agent.capabilities.length === 0 && (
                            <span className="text-gray-500 italic">No specific capabilities listed.</span>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
