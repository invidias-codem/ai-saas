/**
 * Simple fallback APIs for common real-time data queries.
 * Used when AnyCrawl is unavailable.
 */

import axios from 'axios';

// ============================================
// INTERFACES
// ============================================

export interface CryptoPrice {
    symbol: string;
    name: string;
    price_usd: number;
    change_24h: number;
    last_updated: string;
}

export interface WeatherData {
    city: string;
    country: string;
    temperature_f: number;
    temperature_c: number;
    feels_like_f: number;
    condition: string;
    humidity: number;
    wind_mph: number;
    last_updated: string;
}

export interface NewsArticle {
    title: string;
    source: string;
    url: string;
    publishedAt: string;
    description: string;
}

export interface StockQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    volume: number;
    lastUpdated: string;
}

// ============================================
// CRYPTO (CoinGecko - No API key needed)
// ============================================

export async function getCryptoPrice(symbol: string): Promise<CryptoPrice | null> {
    try {
        const symbolToId: Record<string, string> = {
            'btc': 'bitcoin', 'bitcoin': 'bitcoin',
            'eth': 'ethereum', 'ethereum': 'ethereum',
            'doge': 'dogecoin', 'dogecoin': 'dogecoin',
            'sol': 'solana', 'solana': 'solana',
            'xrp': 'ripple', 'ada': 'cardano',
            'bnb': 'binancecoin', 'matic': 'matic-network', 'polygon': 'matic-network',
        };

        const coinId = symbolToId[symbol.toLowerCase()] || symbol.toLowerCase();
        console.log(`[CoinGecko] Fetching price for: ${coinId}`);

        const response = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
            { timeout: 10000 }
        );

        const data = response.data[coinId];
        if (!data) return null;

        console.log(`[CoinGecko] Got price: $${data.usd}`);
        return {
            symbol: symbol.toUpperCase(),
            name: coinId.charAt(0).toUpperCase() + coinId.slice(1),
            price_usd: data.usd,
            change_24h: data.usd_24h_change || 0,
            last_updated: new Date(data.last_updated_at * 1000).toISOString()
        };
    } catch (error: any) {
        console.error(`[CoinGecko] Error:`, error?.message);
        return null;
    }
}

export function isCryptoQuery(query: string): { isCrypto: boolean; symbol: string | null } {
    const lowerQuery = query.toLowerCase();
    const cryptoKeywords = [
        { pattern: /bitcoin|btc/i, symbol: 'bitcoin' },
        { pattern: /ethereum|eth(?!\w)/i, symbol: 'ethereum' },
        { pattern: /dogecoin|doge/i, symbol: 'dogecoin' },
        { pattern: /solana|sol(?!\w)/i, symbol: 'solana' },
        { pattern: /ripple|xrp/i, symbol: 'ripple' },
        { pattern: /cardano|ada(?!\w)/i, symbol: 'cardano' },
        { pattern: /polygon|matic/i, symbol: 'matic-network' },
    ];

    if (!/price|cost|worth|value|current|today/i.test(lowerQuery)) {
        return { isCrypto: false, symbol: null };
    }

    for (const { pattern, symbol } of cryptoKeywords) {
        if (pattern.test(lowerQuery)) return { isCrypto: true, symbol };
    }
    return { isCrypto: false, symbol: null };
}

export function formatCryptoPriceAsSearchResult(price: CryptoPrice): string {
    const dir = price.change_24h >= 0 ? '▲' : '▼';
    return `
## Real-Time Cryptocurrency Data (CoinGecko)
**${price.name} (${price.symbol})**: $${price.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
**24h Change**: ${dir} ${Math.abs(price.change_24h).toFixed(2)}%
**Updated**: ${new Date(price.last_updated).toLocaleString()}
`;
}

// ============================================
// WEATHER (OpenWeatherMap)
// ============================================

export async function getWeather(city: string): Promise<WeatherData | null> {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
        console.warn('[Weather] OPENWEATHERMAP_API_KEY not configured');
        return null;
    }

    try {
        console.log(`[Weather] Fetching weather for: ${city}`);
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`,
            { timeout: 10000 }
        );

        const data = response.data;
        console.log(`[Weather] Got data for ${data.name}`);

        return {
            city: data.name,
            country: data.sys.country,
            temperature_f: Math.round(data.main.temp),
            temperature_c: Math.round((data.main.temp - 32) * 5 / 9),
            feels_like_f: Math.round(data.main.feels_like),
            condition: data.weather[0]?.description || 'Unknown',
            humidity: data.main.humidity,
            wind_mph: Math.round(data.wind.speed),
            last_updated: new Date().toISOString()
        };
    } catch (error: any) {
        console.error(`[Weather] Error:`, error?.response?.data?.message || error?.message);
        return null;
    }
}

export function isWeatherQuery(query: string): { isWeather: boolean; city: string | null } {
    const lowerQuery = query.toLowerCase();

    // Patterns: "weather in [city]", "temperature in [city]", "forecast [city]"
    const weatherPatterns = [
        /weather\s+(?:in|for|at)\s+([a-zA-Z\s]+)/i,
        /temperature\s+(?:in|for|at)\s+([a-zA-Z\s]+)/i,
        /forecast\s+(?:in|for|at|of)?\s*([a-zA-Z\s]+)/i,
        /(?:how'?s?\s+the\s+)?weather\s+(?:like\s+)?(?:in|at)\s+([a-zA-Z\s]+)/i,
        /what(?:'s|s)?\s+(?:the\s+)?weather\s+(?:in|like\s+in)\s+([a-zA-Z\s]+)/i,
    ];

    for (const pattern of weatherPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            return { isWeather: true, city: match[1].trim() };
        }
    }
    return { isWeather: false, city: null };
}

export function formatWeatherAsSearchResult(weather: WeatherData): string {
    return `
## Real-Time Weather Data (OpenWeatherMap)
**Location**: ${weather.city}, ${weather.country}
**Temperature**: ${weather.temperature_f}°F (${weather.temperature_c}°C)
**Feels Like**: ${weather.feels_like_f}°F
**Conditions**: ${weather.condition}
**Humidity**: ${weather.humidity}%
**Wind**: ${weather.wind_mph} mph
**Updated**: ${new Date(weather.last_updated).toLocaleString()}
`;
}

// ============================================
// NEWS (NewsAPI)
// ============================================

export async function getNews(topic: string, limit: number = 3): Promise<NewsArticle[]> {
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey) {
        console.warn('[News] NEWSAPI_KEY not configured');
        return [];
    }

    try {
        console.log(`[News] Fetching news for: ${topic}`);
        const response = await axios.get(
            `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&sortBy=publishedAt&pageSize=${limit}&apiKey=${apiKey}`,
            { timeout: 10000 }
        );

        const articles = response.data.articles || [];
        console.log(`[News] Got ${articles.length} articles`);

        return articles.slice(0, limit).map((a: any) => ({
            title: a.title,
            source: a.source?.name || 'Unknown',
            url: a.url,
            publishedAt: a.publishedAt,
            description: a.description || ''
        }));
    } catch (error: any) {
        console.error(`[News] Error:`, error?.response?.data?.message || error?.message);
        return [];
    }
}

export function isNewsQuery(query: string): { isNews: boolean; topic: string | null } {
    const patterns = [
        /(?:latest|recent|current|today'?s?)\s+news\s+(?:about|on|for)\s+(.+)/i,
        /news\s+(?:about|on|for)\s+(.+)/i,
        /headlines?\s+(?:about|on|for)\s+(.+)/i,
        /what(?:'s|s)?\s+(?:the\s+)?(?:latest|new)\s+(?:news\s+)?(?:on|about)\s+(.+)/i,
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            return { isNews: true, topic: match[1].trim().replace(/\?$/, '') };
        }
    }
    return { isNews: false, topic: null };
}

export function formatNewsAsSearchResult(articles: NewsArticle[]): string {
    if (articles.length === 0) return '';

    let result = `## Latest News (NewsAPI)\n\n`;
    articles.forEach((a, i) => {
        const date = new Date(a.publishedAt).toLocaleDateString();
        result += `### ${i + 1}. ${a.title}\n`;
        result += `**Source**: ${a.source} | **Date**: ${date}\n`;
        result += `${a.description}\n\n`;
    });
    return result;
}

// ============================================
// STOCKS (Alpha Vantage)
// ============================================

export async function getStockQuote(symbol: string): Promise<StockQuote | null> {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
        console.warn('[Stocks] ALPHA_VANTAGE_API_KEY not configured');
        return null;
    }

    try {
        console.log(`[Stocks] Fetching quote for: ${symbol}`);
        const response = await axios.get(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol.toUpperCase()}&apikey=${apiKey}`,
            { timeout: 10000 }
        );

        const quote = response.data['Global Quote'];
        if (!quote || !quote['05. price']) {
            console.warn(`[Stocks] No data for ${symbol}`);
            return null;
        }

        console.log(`[Stocks] Got price: $${quote['05. price']}`);
        return {
            symbol: quote['01. symbol'],
            price: parseFloat(quote['05. price']),
            change: parseFloat(quote['09. change']),
            changePercent: parseFloat(quote['10. change percent']?.replace('%', '') || '0'),
            high: parseFloat(quote['03. high']),
            low: parseFloat(quote['04. low']),
            volume: parseInt(quote['06. volume'] || '0'),
            lastUpdated: quote['07. latest trading day']
        };
    } catch (error: any) {
        console.error(`[Stocks] Error:`, error?.message);
        return null;
    }
}

export function isStockQuery(query: string): { isStock: boolean; symbol: string | null } {
    const patterns = [
        /(?:stock\s+)?price\s+(?:of|for)\s+([A-Za-z]+)\s*(?:stock)?/i,
        /([A-Z]{1,5})\s+stock\s+price/i,
        /how\s+(?:is|much\s+is)\s+([A-Za-z]+)\s+(?:stock|trading)/i,
        /what(?:'s|s)?\s+(?:the\s+)?(?:stock\s+)?price\s+(?:of|for)\s+([A-Za-z]+)/i,
    ];

    // Common company name to ticker mappings
    const companyToTicker: Record<string, string> = {
        'apple': 'AAPL', 'google': 'GOOGL', 'alphabet': 'GOOGL',
        'microsoft': 'MSFT', 'amazon': 'AMZN', 'tesla': 'TSLA',
        'meta': 'META', 'facebook': 'META', 'nvidia': 'NVDA',
        'netflix': 'NFLX', 'disney': 'DIS', 'intel': 'INTC',
    };

    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            const input = match[1].trim().toLowerCase();
            const symbol = companyToTicker[input] || input.toUpperCase();
            return { isStock: true, symbol };
        }
    }
    return { isStock: false, symbol: null };
}

export function formatStockAsSearchResult(quote: StockQuote): string {
    const dir = quote.change >= 0 ? '▲' : '▼';
    const color = quote.change >= 0 ? 'up' : 'down';
    return `
## Real-Time Stock Data (Alpha Vantage)
**${quote.symbol}**: $${quote.price.toFixed(2)} USD
**Change**: ${dir} $${Math.abs(quote.change).toFixed(2)} (${quote.changePercent.toFixed(2)}%) ${color}
**Day Range**: $${quote.low.toFixed(2)} - $${quote.high.toFixed(2)}
**Volume**: ${quote.volume.toLocaleString()}
**Last Trading Day**: ${quote.lastUpdated}
`;
}

