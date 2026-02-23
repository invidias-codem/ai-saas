
import dotenv from 'dotenv';
import path from 'path';

// Load env vars FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runtest() {
    console.log("Testing Search Fallback...");
    console.log("TAVILY_API_KEY:", process.env.TAVILY_API_KEY ? "Set" : "Not Set");

    // Dynamic import to ensure env vars are loaded
    const { searchWeb } = await import('../lib/integrations/anyCrawl');

    try {
        const results = await searchWeb("latest react version");
        console.log("Search Results Count:", results.length);
        if (results.length > 0) {
            console.log("SUCCESS: Got search results (likely via fallback)");
            console.log("First Result:", results[0].title);
        } else {
            console.log("FAILURE: No results returned");
        }
    } catch (error) {
        console.error("Test Failed:", error);
    }
}

runtest();
