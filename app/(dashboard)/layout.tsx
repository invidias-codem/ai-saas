// app/(dashboard)/layout.tsx

import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";

// ✅ ADD THIS LINE to force dynamic rendering for this layout
export const dynamic = 'force-dynamic';

const DashboardLayout = ({
    children
}: {
    children: React.ReactNode;
}) => {
    return (
        <div className="h-full relative flex flex-col md:flex-row">
            <div className="hidden h-full md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-[80] bg-gray-900">
                <Sidebar />
            </div>
            <main className="flex-1 md:pl-72 h-full flex flex-col overflow-hidden">
                <div className="flex-none">
                    <Navbar />
                </div>
                <div className="flex-1 overflow-hidden h-full relative">
                    {children}
                </div>
            </main>
        </div>
    )
}

export default DashboardLayout;