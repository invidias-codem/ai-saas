import { jest } from '@jest/globals';

describe('CrawlLimitReachedError', () => {
    let CrawlLimitReachedError: any;

    beforeEach(async () => {
        jest.resetModules();
        const errorModule = await import('../../errors/CrawlLimitReachedError.js');
        CrawlLimitReachedError = errorModule.CrawlLimitReachedError;
    });

    describe('CrawlLimitReachedError class', () => {
        test('should create CrawlLimitReachedError instance', () => {
            const error = new CrawlLimitReachedError('job-123', 'max pages', 100, 50);
            expect(error).toBeInstanceOf(CrawlLimitReachedError);
            expect(error).toBeInstanceOf(Error);
        });

        test('should have correct error message format', () => {
            const error = new CrawlLimitReachedError('job-123', 'max pages', 100, 50);
            expect(error.message).toBe('Crawl limit reached - max pages. Processed 50/100 pages. This is expected behavior, not an error.');
        });

        test('should have correct error name', () => {
            const error = new CrawlLimitReachedError('job-123', 'test', 10, 5);
            expect(error.name).toBe('CrawlLimitReachedError');
        });

        test('should have correct properties', () => {
            const error = new CrawlLimitReachedError('job-456', 'timeout', 200, 150);
            expect(error.jobId).toBe('job-456');
            expect(error.reason).toBe('timeout');
            expect(error.limit).toBe(200);
            expect(error.current).toBe(150);
        });

        test('should be throwable', () => {
            expect(() => {
                throw new CrawlLimitReachedError('job-789', 'test throw', 1, 1);
            }).toThrow(CrawlLimitReachedError);
        });

        test('should be catchable as Error', () => {
            try {
                throw new CrawlLimitReachedError('job-999', 'test catch', 5, 3);
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect(error).toBeInstanceOf(CrawlLimitReachedError);
            }
        });

        test('should handle zero values', () => {
            const error = new CrawlLimitReachedError('job-000', 'zero test', 0, 0);
            expect(error.limit).toBe(0);
            expect(error.current).toBe(0);
            expect(error.message).toContain('0/0');
        });

        test('should handle large numbers', () => {
            const error = new CrawlLimitReachedError('job-big', 'large test', 10000, 9999);
            expect(error.limit).toBe(10000);
            expect(error.current).toBe(9999);
            expect(error.message).toContain('9999/10000');
        });
    });

    describe('error properties', () => {
        test('should have standard Error properties', () => {
            const error = new CrawlLimitReachedError('job-test', 'test error', 50, 25);
            
            expect(error.message).toBeDefined();
            expect(error.name).toBeDefined();
            expect(typeof error.stack).toBe('string');
        });

        test('should be instanceof Error hierarchy', () => {
            const error = new CrawlLimitReachedError('job-hierarchy', 'hierarchy test', 10, 8);
            
            expect(error instanceof Error).toBe(true);
            expect(error instanceof CrawlLimitReachedError).toBe(true);
        });

        test('should have type property', () => {
            const error = new CrawlLimitReachedError('job-type', 'type test', 15, 12);
            expect(error.type).toBeDefined();
            expect(typeof error.type).toBe('string');
        });
    });

    describe('toString method', () => {
        test('should return formatted string', () => {
            const error = new CrawlLimitReachedError('job-string', 'string test', 20, 18);
            const result = error.toString();
            expect(result).toContain('CrawlLimitReachedError');
            expect(result).toContain(error.message);
        });
    });
});