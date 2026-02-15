import type { AxiosInstance, AxiosResponse } from 'axios';
import type { ApiResponse, CrawlJobResponse, CrawlRequest } from '../types.js';
import { omitUndefined, buildCrawlScrapeOptions } from '../utils/index.js';

export async function createCrawl(client: AxiosInstance, input: CrawlRequest): Promise<CrawlJobResponse> {
    const scrape_options = buildCrawlScrapeOptions(input);
    const body: any = { url: input.url, engine: input.engine ?? 'playwright' };
    if (input.exclude_paths != null) body.exclude_paths = input.exclude_paths;
    if (input.include_paths != null) body.include_paths = input.include_paths;
    if (input.max_depth != null) body.max_depth = input.max_depth;
    if (input.strategy != null) body.strategy = input.strategy;
    if (input.limit != null) body.limit = input.limit;
    if (input.retry != null) body.retry = input.retry;
    if (scrape_options && Object.keys(scrape_options).length > 0) body.scrape_options = scrape_options;
    const response: AxiosResponse<ApiResponse<CrawlJobResponse>> = await client.post('/v1/crawl', body);
    if (!response.data.success) throw new Error((response.data as any).error || 'Crawl creation failed');
    return (response.data as any).data;
}


