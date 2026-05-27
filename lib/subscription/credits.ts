import { clerkClient } from '@clerk/nextjs/server';

export const INITIAL_CREDITS = 200;

export async function getUserCredits(userId: string): Promise<number> {
    try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        
        // If credits have been set, return them
        if (user.privateMetadata && typeof user.privateMetadata.computeCredits === 'number') {
            return user.privateMetadata.computeCredits;
        }

        // Initialize user with default credits if not set
        await client.users.updateUserMetadata(userId, {
            privateMetadata: {
                computeCredits: INITIAL_CREDITS
            }
        });
        return INITIAL_CREDITS;
    } catch (err) {
        console.error('[Credits] Failed to fetch credits for user:', err);
        return 0;
    }
}

export async function deductUserCredits(userId: string, currentCredits: number, amount: number): Promise<number> {
    const newCredits = Math.max(0, currentCredits - amount);
    try {
        const client = await clerkClient();
        await client.users.updateUserMetadata(userId, {
            privateMetadata: {
                computeCredits: newCredits
            }
        });
    } catch (err) {
        console.error('[Credits] Failed to deduct credits:', err);
    }
    return newCredits;
}

export function calculateInteractionCost(options: {
    hasAttachments: boolean;
    mode: string;
}): number {
    let cost = 1; // Standard text reply
    if (options.hasAttachments) {
        cost += 4; // File ingestion overhead
    }
    if (options.mode === 'agentic' || options.mode === 'reasoning') {
        cost += 4; // Premium agent overhead
    }
    return cost;
}
