import { Metadata } from 'next';
import ExpertLandingClient from './ExpertLandingClient';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Expert as a Service | Lattice OS',
    description: 'Rentable domain expertise with sandboxed execution, trajectory transparency, and curated knowledge substrates.',
  };
}

export default function ExpertLandingPage() {
  return <ExpertLandingClient />;
}
