import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ExpertPreviewPage({ params }: PageProps) {
  const { locale } = await params;
  // Redirect to root route — middleware will assign a variant
  redirect(`/${locale}`);
}
