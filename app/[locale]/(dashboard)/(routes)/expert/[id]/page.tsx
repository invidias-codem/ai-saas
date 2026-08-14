import { Metadata } from 'next';
import { SMEWorkspace } from '@/components/workspace/SMEWorkspace';

interface ExpertPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ExpertPageProps): Promise<Metadata> {
  const { id } = await params;
  const { supabaseAdmin } = await import('@/lib/supabaseClient');

  let consultant = {
    title: 'Expert',
    domain: 'Domain Advisory',
    mode: 'analytical',
  };

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('consultant_profiles')
      .select('title, domain, mode')
      .eq('id', id)
      .maybeSingle();

    if (data) {
      consultant = {
        title: data.title || consultant.title,
        domain: data.domain || consultant.domain,
        mode: data.mode || consultant.mode,
      };
    }
  }

  return {
    title: `${consultant.title} | Lattice OS`,
    description: `Rentable domain expertise: ${consultant.domain}`,
  };
}

export default async function ExpertPage({ params }: ExpertPageProps) {
  const { id } = await params;
  const { supabaseAdmin } = await import('@/lib/supabaseClient');

  let consultant = {
    id,
    title: 'Expert',
    domain: 'Domain Advisory',
    mode: 'analytical',
  };

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('consultant_profiles')
      .select('title, domain, mode, description')
      .eq('id', id)
      .maybeSingle();

    if (data) {
      consultant = {
        id,
        title: data.title || consultant.title,
        domain: data.domain || consultant.domain,
        mode: data.mode || consultant.mode,
      };
    }
  }

  return <SMEWorkspace consultant={consultant} />;
}
