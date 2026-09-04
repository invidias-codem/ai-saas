// app/(dashboard)/layout.tsx

import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";
import { getConversationsForUser } from "@/lib/conversations/list";

export const dynamic = 'force-dynamic';

const DashboardLayout = async ({
    children
}: {
    children: React.ReactNode;
}) => {
    // Single server-side prefetch shared by desktop + mobile sidebars.
    const { conversations } = await getConversationsForUser();

    return (
        <div className="h-full relative flex flex-col md:flex-row">
            <div className="hidden h-full md:flex md:w-72 md:flex-col md:fixed md:inset-y-0 z-[80] bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-white/10">
                <Sidebar initialConversations={conversations} />
            </div>
            <main className="flex-1 md:pl-72 h-full flex flex-col overflow-hidden">
                <div className="flex-none">
                    <Navbar initialConversations={conversations} />
                </div>
                <div className="flex-1 overflow-auto h-full relative">
                    {children}
                </div>
            </main>
        </div>
    )
}

export default DashboardLayout;