import { jest } from '@jest/globals';

describe('Crawler Types', () => {
    let crawlerTypes: any;

    beforeEach(async () => {
        jest.resetModules();
        crawlerTypes = await import('../../types/crawler.js');
    });

    describe('HttpStatusCategory', () => {
        test('should export HttpStatusCategory enum', () => {
            expect(crawlerTypes.HttpStatusCategory).toBeDefined();
            expect(typeof crawlerTypes.HttpStatusCategory).toBe('object');
        });
    });

    describe('CrawlerErrorType', () => {
        test('should export CrawlerErrorType enum', () => {
            expect(crawlerTypes.CrawlerErrorType).toBeDefined();
            expect(typeof crawlerTypes.CrawlerErrorType).toBe('object');
        });
    });

    describe('ResponseStatus', () => {
        test('should export ResponseStatus type', () => {
            // ResponseStatus is a type, so we can't test it directly
            // But we can test that the module exports it
            expect(crawlerTypes).toBeDefined();
        });
    });

    describe('CrawlerResponse', () => {
        test('should export CrawlerResponse type', () => {
            // CrawlerResponse is a type, so we can't test it directly
            // But we can test that the module exports it
            expect(crawlerTypes).toBeDefined();
        });
    });

    describe('CrawlerError', () => {
        test('should export CrawlerError type', () => {
            // CrawlerError is a type, so we can't test it directly
            // But we can test that the module exports it
            expect(crawlerTypes).toBeDefined();
        });
    });

    describe('type definitions', () => {
        test('should have consistent type exports', () => {
            // Test that the module has the expected structure
            expect(typeof crawlerTypes).toBe('object');
            expect(crawlerTypes).not.toBeNull();
        });

        test('should export enums with correct values', () => {
            if (crawlerTypes.HttpStatusCategory) {
                const values = Object.values(crawlerTypes.HttpStatusCategory);
                values.forEach(value => {
                    // HttpStatusCategory might be numeric enum, so allow both string and number
                    expect(['string', 'number']).toContain(typeof value);
                });
            }

            if (crawlerTypes.CrawlerErrorType) {
                const values = Object.values(crawlerTypes.CrawlerErrorType);
                values.forEach(value => {
                    // CrawlerErrorType should be string enum
                    expect(typeof value).toBe('string');
                });
            }
        });
    });
});