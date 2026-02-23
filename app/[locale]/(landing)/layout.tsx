
import { LandingNavbar } from "@/components/landing/navbar";

export default function MarketingLayout({
    children
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="bg-background min-h-screen flex flex-col">
            <LandingNavbar />
            <div className="flex-grow">
                {children}
            </div>
        </div>
    );
}
