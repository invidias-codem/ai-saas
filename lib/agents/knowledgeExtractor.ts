/**
 * Knowledge Extractor - Extracts learnable facts from search results and conversations
 * Parses structured data from API responses and identifies key facts
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';

const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export interface ExtractedFact {
    topic: string;
    fact: string;
    confidence: number;
    expiresIn?: number; // seconds until expiration (e.g., 3600 for crypto prices)
    sourceUrl?: string;
}

/**
 * Extract facts from a search result or API response
 */
export async function extractFacts(
    content: string,
    contentType: 'crypto' | 'weather' | 'news' | 'stock' | 'general',
    sourceUrl?: string
): Promise<ExtractedFact[]> {
    // For API responses, we can extract structured facts directly
    if (contentType !== 'general') {
        return extractStructuredFacts(content, contentType, sourceUrl);
    }

    // For general content, use LLM extraction
    return extractWithLLM(content, sourceUrl);
}

/**
 * Extract facts from structured API responses (crypto, weather, etc.)
 */
function extractStructuredFacts(
    content: string,
    contentType: 'crypto' | 'weather' | 'news' | 'stock',
    sourceUrl?: string
): ExtractedFact[] {
    const facts: ExtractedFact[] = [];

    // Parse based on content type markers in the formatted response
    const lines = content.split('\n').filter(l => l.trim());

    switch (contentType) {
        case 'crypto': {
            // Extract crypto price info
            const priceMatch = content.match(/\*\*([^*]+)\*\*:\s*\$([0-9,]+\.?\d*)/);
            const changeMatch = content.match(/24h Change\*\*:\s*([▲▼])\s*([0-9.]+)%/);

            if (priceMatch) {
                facts.push({
                    topic: `${priceMatch[1]} cryptocurrency`,
                    fact: `Current price is $${priceMatch[2]} USD`,
                    confidence: 0.95,
                    expiresIn: 300, // 5 minutes - crypto prices change fast
                    sourceUrl
                });
            }
            if (changeMatch) {
                const direction = changeMatch[1] === '▲' ? 'up' : 'down';
                facts.push({
                    topic: 'Cryptocurrency 24h trend',
                    fact: `Price is ${direction} ${changeMatch[2]}% in the last 24 hours`,
                    confidence: 0.9,
                    expiresIn: 3600, // 1 hour
                    sourceUrl
                });
            }
            break;
        }

        case 'weather': {
            const locationMatch = content.match(/\*\*Location\*\*:\s*([^\n]+)/);
            const tempMatch = content.match(/\*\*Temperature\*\*:\s*([^\n]+)/);
            const conditionsMatch = content.match(/\*\*Conditions\*\*:\s*([^\n]+)/);

            if (locationMatch && tempMatch) {
                facts.push({
                    topic: `Weather in ${locationMatch[1]}`,
                    fact: `Temperature is ${tempMatch[1]}`,
                    confidence: 0.95,
                    expiresIn: 3600, // 1 hour
                    sourceUrl
                });
            }
            if (locationMatch && conditionsMatch) {
                facts.push({
                    topic: `Weather conditions in ${locationMatch[1]}`,
                    fact: `Currently ${conditionsMatch[1]}`,
                    confidence: 0.9,
                    expiresIn: 3600,
                    sourceUrl
                });
            }
            break;
        }

        case 'stock': {
            const symbolMatch = content.match(/\*\*([A-Z]{1,5})\*\*:\s*\$([0-9.]+)/);
            const changeMatch = content.match(/\*\*Change\*\*:\s*([▲▼])\s*\$([0-9.]+)\s*\(([0-9.]+)%\)/);

            if (symbolMatch) {
                facts.push({
                    topic: `${symbolMatch[1]} stock price`,
                    fact: `Trading at $${symbolMatch[2]}`,
                    confidence: 0.95,
                    expiresIn: 900, // 15 minutes during market hours
                    sourceUrl
                });
            }
            if (symbolMatch && changeMatch) {
                const direction = changeMatch[1] === '▲' ? 'up' : 'down';
                facts.push({
                    topic: `${symbolMatch[1]} stock movement`,
                    fact: `Stock is ${direction} ${changeMatch[3]}% ($${changeMatch[2]}) today`,
                    confidence: 0.9,
                    expiresIn: 900,
                    sourceUrl
                });
            }
            break;
        }

        case 'news': {
            // Extract headlines as facts
            const headlineMatches = content.matchAll(/###\s*\d+\.\s*([^\n]+)/g);
            let count = 0;
            for (const match of headlineMatches) {
                if (count >= 3) break; // Max 3 headlines
                facts.push({
                    topic: 'Recent news',
                    fact: match[1].trim(),
                    confidence: 0.85,
                    expiresIn: 86400, // 24 hours
                    sourceUrl
                });
                count++;
            }
            break;
        }
    }

    console.log(`[KnowledgeExtractor] Extracted ${facts.length} structured facts from ${contentType}`);
    return facts;
}

/**
 * Use LLM to extract facts from unstructured content
 */
async function extractWithLLM(content: string, sourceUrl?: string): Promise<ExtractedFact[]> {
    try {
        const prompt = `Extract 2-3 key factual statements from this content. 
Return ONLY a JSON array with objects containing: topic, fact, confidence (0-1).
Focus on specific, verifiable facts. Skip opinions.

Content:
${content.substring(0, 2000)}

JSON:`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Parse JSON from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((f: any) => ({
            topic: f.topic || 'General',
            fact: f.fact,
            confidence: Math.min(0.8, f.confidence || 0.7), // Cap at 0.8 for LLM extraction
            expiresIn: 86400 * 7, // 1 week for general facts
            sourceUrl
        }));
    } catch (err) {
        console.error('[KnowledgeExtractor] LLM extraction failed:', err);
        return [];
    }
}

/**
 * Determine content type from query or result
 */
export function detectContentType(query: string): 'crypto' | 'weather' | 'news' | 'stock' | 'general' {
    const lower = query.toLowerCase();

    if (/bitcoin|ethereum|crypto|btc|eth|doge|sol|xrp/i.test(lower)) return 'crypto';
    if (/weather|temperature|forecast|rain|sunny|cloudy/i.test(lower)) return 'weather';
    if (/news|headlines|latest|breaking|current events/i.test(lower)) return 'news';
    if (/stock|shares|trading|market|nasdaq|nyse|aapl|msft|googl/i.test(lower)) return 'stock';

    return 'general';
}
