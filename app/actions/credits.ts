"use server";

import { auth } from "@clerk/nextjs/server";
import { getCredits } from "@/lib/credits";

export async function getCreditsAction() {
    const { userId } = await auth();
    if (!userId) return 0;

    return await getCredits(userId);
}
