import { Response, NextFunction } from "express";
import { getDB, schemas, eq, sql } from "@anycrawl/db";
import { RequestWithAuth } from "@anycrawl/libs";
import { log } from "@anycrawl/libs/log";

// did not need to deduct credits.
const ignoreDeductRoutes: string[] = [

];

// TODO: need to improve this middleware.
export const deductCreditsMiddleware = async (
    req: RequestWithAuth,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // Skip if auth is disabled or credits deduction is disabled.
    if (process.env.ANYCRAWL_API_AUTH_ENABLED !== "true" || process.env.ANYCRAWL_API_CREDITS_ENABLED !== "true") {
        next();
        return;
    }

    // Store the user UUID for later use
    const userUuid = req.auth?.uuid;

    // Register finish event handler to deduct credits
    res.on("finish", () => {
        if (ignoreDeductRoutes.includes(req.path) || ignoreDeductRoutes.includes(req.route.path)) {
            return;
        }
        if (!req.creditsUsed || req.creditsUsed <= 0) {
            return;
        }
        // Only deduct credits for successful requests
        if (res.statusCode >= 200 && res.statusCode < 400 && req.creditsUsed && req.creditsUsed > 0) {
            // if req.creditsUsed not set, set it to 1. Preserve explicit 0.
            log.info(`[${req.method}] [${req.path}] [${userUuid}] Starting credit deduction: ${req.creditsUsed} credits, status: ${res.statusCode}`);
            if (req.creditsUsed == 0) {
                log.debug(`[${req.method}] [${req.path}] [${userUuid}] No credits needed to deduct (creditsUsed = 0)`);
                return;
            }

            // Fire and forget - don't block response completion
            log.info(`[${req.method}] [${req.path}] [${userUuid}] Initiating async credit deduction for ${req.creditsUsed} credits${req.jobId ? `, jobId: ${req.jobId}` : ''}`);
            deductCreditsAsync(userUuid, req.creditsUsed, req.jobId).catch(error => {
                log.error(`[${req.method}] [${req.path}] [${userUuid}] Failed to deduct credits: ${req.creditsUsed} credits, error: ${error}`);
            });
        }
    });

    next();
};

/**
 * Asynchronously deduct credits without blocking the response
 * This function runs in the background and doesn't affect response time
 */
async function deductCreditsAsync(
    userUuid: string | undefined,
    creditsUsed: number,
    jobId?: string
): Promise<void> {
    if (!userUuid) {
        log.warning(`Cannot deduct credits: user UUID not found for jobId: ${jobId || 'N/A'}`);
        return;
    }

    try {
        const db = await getDB();

        // Use transaction to ensure atomicity of credits deduction and job update
        log.info(`[${userUuid}] [${jobId || 'N/A'}] Starting transaction to deduct ${creditsUsed} credits`);
        await db.transaction(async (tx: any) => {
            // Update credits and last_used_at atomically; ensure the query executes
            await tx
                .update(schemas.apiKey)
                .set({
                    credits: sql`${schemas.apiKey.credits} - ${creditsUsed}`,
                    lastUsedAt: new Date()
                })
                .where(eq(schemas.apiKey.uuid, userUuid));

            // If this request is associated with a job, update jobs.credits_used accordingly
            if (jobId) {
                await tx.update(schemas.jobs).set({
                    creditsUsed: sql`${schemas.jobs.creditsUsed} + ${creditsUsed}`,
                    updatedAt: new Date(),
                }).where(eq(schemas.jobs.jobId, jobId));
            }

            // Optional: fetch remaining credits for logging/verification
            try {
                const [after] = await tx
                    .select({ credits: schemas.apiKey.credits })
                    .from(schemas.apiKey)
                    .where(eq(schemas.apiKey.uuid, userUuid));
                if (after && typeof after.credits === 'number') {
                    log.info(`[${userUuid}] [${jobId || 'N/A'}] Credit deduction completed successfully: -${creditsUsed} credits, remaining: ${after.credits}`);
                } else {
                    log.info(`[${userUuid}] [${jobId || 'N/A'}] Credit deduction completed successfully: -${creditsUsed} credits`);
                }
            } catch {
                // Fallback if select fails (e.g., transient issues)
                log.info(`[${userUuid}] [${jobId || 'N/A'}] Credit deduction completed successfully: -${creditsUsed} credits`);
            }
        });
    } catch (error) {
        log.error(`[${userUuid}] [${jobId || 'N/A'}] Failed to deduct credits: ${creditsUsed} credits, error: ${error}`);
        throw error; // Re-throw to be caught by the caller
    }
} 