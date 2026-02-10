import { QueueEvents } from "bullmq";

export class EventManager {
    private static instance: EventManager;
    private events: Map<string, QueueEvents> = new Map();

    private constructor() { }

    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }
    public async getEvent(name: string): Promise<QueueEvents> {
        if (!this.events.has(name)) {
            this.events.set(
                name,
                new QueueEvents(
                    name
                )
            );
        }
        return this.events.get(name)!;
    }
}
