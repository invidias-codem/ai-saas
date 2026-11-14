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
        <div className="relative flex h-full flex-col bg-background text-foreground md:flex-row">
            <div className="hidden h-full border-r border-border bg-chrome md:fixed md:inset-y-0 md:z-30 md:flex md:w-72 md:flex-col">
                <Sidebar initialConversations={conversations} />
            </div>
            <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:pl-72">
                <div className="flex-none">
                    <Navbar initialConversations={conversations} />
                </div>
                <div className="relative min-h-0 flex-1 overflow-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}

export default DashboardLayout;
