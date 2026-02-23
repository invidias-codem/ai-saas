import { jest } from '@jest/globals';
import type { ScrapeRequest, CrawlRequest, SearchRequest } from '../types.js';
import type { AnyCrawlClient as AnyCrawlClientType } from '../index.js';
// ESM-compatible mocking: mock axios BEFORE importing the module under test
await jest.unstable_mockModule('axios', () => ({
    __esModule: true,
    default: { create: jest.fn() },
}));

const { AnyCrawlClient } = await import('../index.js');
const axios: any = (await import('axios')).default;
const mockedAxios = axios as { create: jest.Mock };

describe('AnyCrawlClient', () => {
    let client: AnyCrawlClientType;
    let mockAxiosInstance: any;

    beforeEach(() => {
        mockAxiosInstance = {
            get: jest.fn(),
            post: jest.fn(),
            delete: jest.fn(),
            interceptors: {
                response: {
                    use: jest.fn(),
                },
            },
        };
        mockedAxios.create.mockReturnValue(mockAxiosInstance);
        client = new AnyCrawlClient('test-api-key', 'https://api.test.com');
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with default base URL', () => {
            const defaultClient = new AnyCrawlClient('test-key');
            expect(mockedAxios.create).toHaveBeenCalledWith({
                baseURL: 'https://api.anycrawl.dev',
                headers: {
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json',
                },
                timeout: 300000,
            });
        });

        it('should initialize with custom base URL', () => {
            const customClient = new AnyCrawlClient('test-key', 'https://custom.api.com');
            expect(mockedAxios.create).toHaveBeenCalledWith({
                baseURL: 'https://custom.api.com',
                headers: {
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json',
                },
                timeout: 300000,
            });
        });
    });

    describe('healthCheck', () => {
        it('should return health status', async () => {
            const mockResponse = { data: { status: 'ok' } };
            mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

            const result = await client.healthCheck();

            expect(result).toEqual({ status: 'ok' });
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
        });

        it('should handle health check errors', async () => {
            mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

            await expect(client.healthCheck()).rejects.toThrow('Network error');
        });
    });

    describe('scrape', () => {
        it('should scrape a URL successfully with minimal options', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        url: 'https://example.com',
                        status: 'completed',
                        jobId: 'test-job-id',
                        title: 'Test Page',
                        html: '<html>Test</html>',
                        markdown: '# Test Page',
                        metadata: [],
                        timestamp: '2024-01-01T00:00:00Z',
                    },
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            const result = await client.scrape({
                url: 'https://example.com',
                engine: 'cheerio',
            });

            expect(result.url).toBe('https://example.com');
            expect(result.status).toBe('completed');
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/scrape', {
                url: 'https://example.com',
                engine: 'cheerio',
            });
        });

        it('should scrape with all options', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        url: 'https://example.com',
                        status: 'completed',
                    },
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            const options: ScrapeRequest = {
                url: 'https://example.com',
                engine: 'playwright',
                proxy: 'http://proxy.example.com:8080',
                formats: ['markdown', 'html', 'screenshot'],
                timeout: 60000,
                retry: true,
                wait_for: 3000,
                include_tags: ['article', 'main'],
                exclude_tags: ['nav', 'footer'],
                json_options: {
                    schema: { type: 'object' },
                    user_prompt: 'Extract article content',
                },
            };

            await client.scrape(options);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/scrape', options);
        });

        it('should throw error when scraping fails', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    error: 'Scraping failed',
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            await expect(
                client.scrape({
                    url: 'https://example.com',
                    engine: 'cheerio',
                })
            ).rejects.toThrow('Scraping failed');
        });

        it('should throw error when API returns no error message', async () => {
            const mockResponse = {
                data: {
                    success: false,
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            await expect(
                client.scrape({
                    url: 'https://example.com',
                    engine: 'cheerio',
                })
            ).rejects.toThrow('Scraping failed');
        });
    });

    describe('createCrawl', () => {
        it('should create crawl job successfully with minimal options', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        job_id: 'test-crawl-id',
                        status: 'created',
                        message: 'Crawl job created',
                    },
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            const result = await client.createCrawl({
                url: 'https://example.com',
                engine: 'cheerio',
            });

            expect(result.job_id).toBe('test-crawl-id');
            expect(result.status).toBe('created');
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/crawl', {
                url: 'https://example.com',
                engine: 'cheerio',
            });
        });

        it('should create crawl job with all options', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        job_id: 'test-crawl-id',
                        status: 'created',
                        message: 'Crawl job created',
                    },
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            const options: CrawlRequest = {
                url: 'https://example.com',
                engine: 'playwright',
                // Scrape options should live inside scrape_options for crawl
                scrape_options: {
                    proxy: 'http://proxy.example.com:8080',
                    formats: ['markdown', 'html'],
                    timeout: 60000,
                    wait_for: 3000,
                    include_tags: ['article'],
                    exclude_tags: ['nav'],
                    json_options: { schema: { type: 'object' } },
                },
                // Retry remains a top-level crawl option
                retry: true,
                exclude_paths: ['/admin/*'],
                include_paths: ['/blog/*'],
                max_depth: 5,
                strategy: 'same-domain',
                limit: 50,
            };

            await client.createCrawl(options);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/crawl', options);
        });

        it('should throw error when crawl creation fails', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    error: 'Crawl creation failed',
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            await expect(
                client.createCrawl({
                    url: 'https://example.com',
                    engine: 'cheerio',
                })
            ).rejects.toThrow('Crawl creation failed');
        });
    });

    describe('getCrawlStatus', () => {
        it('should get crawl status successfully', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        job_id: 'test-crawl-id',
                        status: 'completed',
                        start_time: '2024-01-01T00:00:00Z',
                        expires_at: '2024-01-02T00:00:00Z',
                        credits_used: 10,
                        total: 100,
                        completed: 95,
                        failed: 5,
                    },
                },
            };
            mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

            const result = await client.getCrawlStatus('test-crawl-id');

            expect(result.job_id).toBe('test-crawl-id');
            expect(result.status).toBe('completed');
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/crawl/test-crawl-id/status');
        });

        it('should throw error when getting status fails', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    error: 'Failed to get crawl status',
                },
            };
            mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

            await expect(client.getCrawlStatus('test-crawl-id')).rejects.toThrow('Failed to get crawl status');
        });
    });

    describe('getCrawlResults', () => {
        it('should get crawl results successfully', async () => {
            const mockResponse = {
                data: {
                    status: 'completed',
                    total: 100,
                    completed: 100,
                    creditsUsed: 10,
                    data: [{ url: 'https://example.com', title: 'Test' }],
                },
            };
            mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

            const result = await client.getCrawlResults('test-crawl-id');

            expect(result.status).toBe('completed');
            expect(result.total).toBe(100);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/crawl/test-crawl-id?skip=0');
        });

        it('should get crawl results with skip parameter', async () => {
            const mockResponse = {
                data: {
                    status: 'completed',
                    total: 100,
                    completed: 100,
                    creditsUsed: 10,
                    data: [],
                },
            };
            mockAxiosInstance.get.mockResolvedValueOnce(mockResponse);

            await client.getCrawlResults('test-crawl-id', 50);

            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/v1/crawl/test-crawl-id?skip=50');
        });
    });

    describe('cancelCrawl', () => {
        it('should cancel crawl successfully', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        job_id: 'test-crawl-id',
                        status: 'cancelled',
                    },
                },
            };
            mockAxiosInstance.delete.mockResolvedValueOnce(mockResponse);

            const result = await client.cancelCrawl('test-crawl-id');

            expect(result.job_id).toBe('test-crawl-id');
            expect(result.status).toBe('cancelled');
            expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/v1/crawl/test-crawl-id');
        });

        it('should throw error when cancellation fails', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    error: 'Failed to cancel crawl',
                },
            };
            mockAxiosInstance.delete.mockResolvedValueOnce(mockResponse);

            await expect(client.cancelCrawl('test-crawl-id')).rejects.toThrow('Failed to cancel crawl');
        });
    });

    describe('search', () => {
        it('should search successfully with minimal options', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: [
                        {
                            title: 'Test Result',
                            url: 'https://example.com',
                            description: 'Test description',
                            source: 'google',
                        },
                    ],
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            const result = await client.search({
                query: 'test query',
                scrape_options: { engine: 'cheerio' },
            });

            expect(result).toHaveLength(1);
            expect(result[0]?.title).toBe('Test Result');
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/search', {
                query: 'test query',
                scrape_options: { engine: 'cheerio' },
            });
        });

        it('should search with all options', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: [],
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            const options: SearchRequest = {
                query: 'test query',
                engine: 'google',
                limit: 20,
                offset: 10,
                pages: 2,
                lang: 'en',
                country: 'US',
                scrape_options: { engine: 'playwright' },
                safe_search: 1,
            };

            await client.search(options);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/v1/search', options);
        });

        it('should throw error when search fails', async () => {
            const mockResponse = {
                data: {
                    success: false,
                    error: 'Search failed',
                },
            };
            mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

            await expect(
                client.search({
                    query: 'test query',
                    scrape_options: { engine: 'cheerio' },
                })
            ).rejects.toThrow('Search failed');
        });
    });

    describe('error handling', () => {
        it('should handle network errors', async () => {
            const networkError = new Error('Network error');
            mockAxiosInstance.get.mockRejectedValueOnce(networkError);

            await expect(client.healthCheck()).rejects.toThrow('Network error');
        });

        it('should handle API errors with response', async () => {
            const apiError = {
                response: {
                    status: 400,
                    data: { error: 'Bad Request' },
                },
            };
            mockAxiosInstance.get.mockRejectedValueOnce(apiError);

            await expect(client.healthCheck()).rejects.toThrow('API Error 400: Bad Request');
        });

        it('should handle API errors with message', async () => {
            const apiError = {
                response: {
                    status: 500,
                    data: { message: 'Internal Server Error' },
                },
            };
            mockAxiosInstance.get.mockRejectedValueOnce(apiError);

            await expect(client.healthCheck()).rejects.toThrow('API Error 500: Internal Server Error');
        });

        it('should handle API errors with unknown error', async () => {
            const apiError = {
                response: {
                    status: 500,
                    data: {},
                },
            };
            mockAxiosInstance.get.mockRejectedValueOnce(apiError);

            await expect(client.healthCheck()).rejects.toThrow('API Error 500: Unknown error');
        });

        it('should handle request errors', async () => {
            const requestError = {
                request: {},
                message: 'Request timeout',
            };
            mockAxiosInstance.get.mockRejectedValueOnce(requestError);

            await expect(client.healthCheck()).rejects.toThrow('Network error: Unable to reach AnyCrawl API');
        });

        it('should handle other errors', async () => {
            const otherError = new Error('Other error');
            mockAxiosInstance.get.mockRejectedValueOnce(otherError);

            await expect(client.healthCheck()).rejects.toThrow('Request error: Other error');
        });
    });
});
