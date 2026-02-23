import { existsSync, readFileSync } from "fs";
import * as http from "http";
import * as https from "https";
import { log } from "@anycrawl/libs";

let aiConfigCache: any | null = null;

// Internal: read local file (gracefully return null if not found)
const readLocalConfig = (rawPath: string): any | null => {
    try {
        if (!existsSync(rawPath)) {
            return null;
        }
        return JSON.parse(readFileSync(rawPath, 'utf8'));
    } catch {
        return null;
    }
}

// Internal: fetch remote URL
const fetchRemoteConfig = async (rawUrl: string): Promise<any | null> => {
    const urlObj = new URL(rawUrl);
    const lib = urlObj.protocol === 'https:' ? https : http;
    return await new Promise<any | null>((resolve) => {
        const req = lib.request(urlObj, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                res.resume();
                resolve(null);
                return;
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

// Public: ensure config is loaded (local or URL) and cached
const ensureAIConfigLoaded = async (): Promise<any | null> => {
    if (aiConfigCache) return aiConfigCache;
    const pathEnv = process.env.ANYCRAWL_AI_CONFIG_PATH;
    if (!pathEnv) return null;
    const isHttp = /^https?:\/\//i.test(pathEnv);
    if (isHttp) {
        aiConfigCache = await fetchRemoteConfig(pathEnv);
        if (!aiConfigCache) {
            try { log.warning(`[ai] Failed to load AI config from URL: ${pathEnv}`); } catch { }
        }
    } else {
        aiConfigCache = readLocalConfig(pathEnv);
    }
    return aiConfigCache;
}

// Public: lightweight getter
const getAIConfig = (): any | null => aiConfigCache;

export { ensureAIConfigLoaded, getAIConfig };