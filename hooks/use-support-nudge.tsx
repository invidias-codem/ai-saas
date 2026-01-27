"use client";

import { useState, useEffect } from "react";

type ActivityType = "image" | "video" | "message";

export const useSupportNudge = () => {
    const [showNudge, setShowNudge] = useState(false);

    const triggerNudge = () => {
        setShowNudge(true);
        // Auto-hide after 15 seconds if not interacted with
        setTimeout(() => setShowNudge(false), 15000);
    };

    const trackActivity = (type: ActivityType) => {
        try {
            if (type === "image" || type === "video") {
                // Trigger for every generation
                triggerNudge();
            } else if (type === "message") {
                // Trigger every 10 messages
                const currentCount = parseInt(localStorage.getItem("message_count") || "0");
                const newCount = currentCount + 1;
                localStorage.setItem("message_count", newCount.toString());

                if (newCount % 10 === 0) {
                    triggerNudge();
                }
            }
        } catch (error) {
            console.error("Error tracking activity:", error);
        }
    };

    const dismissNudge = () => setShowNudge(false);

    return {
        showNudge,
        trackActivity,
        dismissNudge
    };
};
