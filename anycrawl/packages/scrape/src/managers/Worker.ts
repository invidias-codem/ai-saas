import { Worker } from "bullmq";
import { Utils } from "../Utils.js";

export class WorkerManager {
    private static instance: WorkerManager;
    private workers: Map<string, Worker> = new Map();

    private constructor() {}

    public static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }
    public async getWorker(name: string, jobHandler: (job: any) => Promise<void>): Promise<Worker> {
        if (!this.workers.has(name)) {
            this.workers.set(
                name,
                new Worker(
                    name,
                    async (job) => {
                        return await jobHandler(job);
                    },
                    {
                        connection: Utils.getInstance().getRedisConnection(),
                        concurrency: 50,
                    }
                )
            );
        }
        return this.workers.get(name)!;
    }
}
