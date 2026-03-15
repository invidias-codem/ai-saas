import { validateExternalUrl } from '@/lib/security/urlValidator';

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Extract content from a URL
 * Returns title and simplified text body
 */
export async function extractUrlContent(url: string): Promise<{ title: string; content: string; description?: string } | null> {
    try {
        // Basic validation
        if (!isValidUrl(url)) {
            return null;
        }

        // specific exclusions (large binary files, etc.)
        if (url.match(/\.(pdf|zip|tar|gz|mp4|mp3|wav|mov|avi|png|jpg|jpeg|gif|webp)$/i)) {
            console.log('[LINK_HELPERS] Skipping binary/media URL:', url);
            return null;
        }

        const ssrfCheck = await validateExternalUrl(url);
        if (!ssrfCheck.valid) {
            console.warn('[LINK_HELPERS] Blocked SSRF attempt:', url, ssrfCheck.reason);
            return null;
        }

        const { data, headers } = await axios.get(url, {
            timeout: 5000, // 5s timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; GenieBot/1.0; +http://genie-ai.com)',
            },
        });

        // Verify content type is text/html
        const contentType = headers['content-type'] || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return null;
        }

        const $ = cheerio.load(data);

        // Remove script, style, and annoying elements
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('footer').remove();
        $('header').remove();
        $('iframe').remove();
        $('.ad').remove();
        $('.advertisement').remove();
        $('#sidebar').remove();

        const title = $('title').text().trim() || '';
        const description = $('meta[name="description"]').attr('content') || '';

        // Get body text, collapsing whitespace
        const bodyContent = $('body').text().replace(/\s+/g, ' ').trim();

        // Limit content length to prevent token overflow (e.g. 10k chars)
        const truncatedContent = bodyContent.substring(0, 20000);

        return {
            title,
            description,
            content: truncatedContent,
        };

    } catch (error) {
        console.warn('[LINK_HELPERS] Error scraping URL:', url, error);
        return null;
    }
}

/**
 * Validate URL structure
 */
function isValidUrl(string: string): boolean {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Find all URLs in a text
 */
export function extractUrlsFromText(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    const matches = text.match(urlRegex);
    return matches ? matches.map(url => url.replace(/>$/, '')) : []; // Remove trailing '>' from Slack auto-linking
}
