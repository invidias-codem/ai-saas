
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";

export default function MarketingLayout({
    children
}: {
    children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen flex flex-col">
      <LandingNavbar />
      <div className="flex-grow">{children}</div>
      <LandingFooter />
    </div>
  );
}
