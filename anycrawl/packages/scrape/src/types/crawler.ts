/**
 * Basic HTTP Status categories for response handling
 */
export enum HttpStatusCategory {
    NO_RESPONSE = 0,
    SUCCESS = 200,
    CLIENT_ERROR = 400,
    SERVER_ERROR = 500
}

/**
 * Error types for crawler operations
 */
export enum CrawlerErrorType {
    HTTP_ERROR = 'http_error',
    EXTRACTION_ERROR = 'extraction_error',
    VALIDATION_ERROR = 'validation_error',
    INTERNAL_ERROR = 'internal_error',
    CRAWL_LIMIT_REACHED = 'crawl_limit_reached',
    CREDITS_INSUFFICIENT = 'credits_insufficient'
}

/**
 * Structure for error reporting
 */
export interface CrawlerError {
    type: CrawlerErrorType;
    message: string;
    code?: number;
    stack?: string;
    url: string;
    metadata?: Record<string, any>;
}

/**
 * Represents the normalized response status information
 */
export interface ResponseStatus {
    statusCode: number;
    statusMessage: string;
}

/**
 * Interface for crawler response objects
 */
export interface CrawlerResponse {
    status?: () => number;
    statusText?: () => string;
    statusCode?: number;
    statusMessage?: string;
} 