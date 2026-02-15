import { CrawlerErrorType } from "../types/crawler.js";

/**
 * Error thrown when crawl limit is reached to abort navigation
 * This error should be ignored and not recorded as a failed job
 */
export class CrawlLimitReachedError extends Error {
    public readonly type = CrawlerErrorType.CRAWL_LIMIT_REACHED;
    public readonly jobId: string;
    public readonly reason: string;
    public readonly limit: number;
    public readonly current: number;

    constructor(jobId: string, reason: string, limit: number, current: number) {
        const message = `Crawl limit reached - ${reason}. Processed ${current}/${limit} pages. This is expected behavior, not an error.`;
        super(message);
        this.name = 'CrawlLimitReachedError';
        this.jobId = jobId;
        this.reason = reason;
        this.limit = limit;
        this.current = current;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CrawlLimitReachedError);
        }
    }

    /**
     * Override toString to hide stack trace and show only essential information
     */
    toString(): string {
        return `${this.name}: ${this.message}`;
    }

    /**
     * Override stack getter to return empty string, hiding the stack trace
     */
    get stack(): string {
        return '';
    }
}
