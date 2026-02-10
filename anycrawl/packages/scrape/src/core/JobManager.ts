import { log } from "crawlee";
import { QueueManager, QueueName } from "../managers/Queue.js";
import { Utils } from "../Utils.js";

/**
 * Job manager for handling job status updates
 * Separates job management logic from the main engine
 */
export class JobManager {
    /**
     * Mark a job as completed and store the data
     */
    async markCompleted(jobId: string, queueName: QueueName, data: any): Promise<void> {
        const job = await QueueManager.getInstance().getJob(queueName, jobId);

        if (!job) {
            log.error(`[${queueName}] [${jobId}] Job not found in queue`);
            return;
        }

        // Update job status to completed
        job.updateData({
            ...job.data,
            status: "completed",
            ...data,
        });

        // Store data in key-value store
        await (await Utils.getInstance().getKeyValueStore()).setValue(jobId, data);
    }

    /**
     * Mark a job as failed
     */
    async markFailed(jobId: string, queueName: QueueName, error: string, data?: any): Promise<void> {
        const job = await QueueManager.getInstance().getJob(queueName, jobId);

        if (!job) {
            log.error(`[${queueName}] [${jobId}] Job not found in queue`);
            return;
        }

        // Update job status to failed
        job.updateData({
            ...job.data,
            status: "failed",
            ...data,
        });
    }
} 