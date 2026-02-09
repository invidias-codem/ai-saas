"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { syncUser } from "@/app/actions/user-sync";

export const UserSyncProvider = ({ children }: { children: React.ReactNode }) => {
    const { isSignedIn, isLoaded, user } = useUser();

    useEffect(() => {
        if (isLoaded && isSignedIn && user) {
            // Call the server action to sync
            syncUser()
                .then((result) => {
                    if (result.error) {
                        console.error("User sync failed:", result.error);
                    } else {
                        // console.log("User synced successfully");
                    }
                })
                .catch((err) => console.error("User sync exception:", err));
        }
    }, [isLoaded, isSignedIn, user?.id]); // specific dependency on user.id to avoid loop

    return <>{children}</>;
};
