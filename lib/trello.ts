
import { db } from "@/lib/firebaseAdmin";
import { decrypt } from "@/lib/encryption";

const TRELLO_API_BASE = 'https://api.trello.com/1';

export class TrelloClient {
    private apiKey: string;
    private token: string;

    constructor(apiKey: string, token: string) {
        this.apiKey = apiKey;
        this.token = token;
    }

    private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
        const url = new URL(`${TRELLO_API_BASE}${path}`);
        url.searchParams.append('key', this.apiKey);
        url.searchParams.append('token', this.token);

        const response = await fetch(url.toString(), {
            ...options,
            headers: {
                'Accept': 'application/json',
                ...options.headers,
            }
        });

        if (!response.ok) {
            throw new Error(`Trello API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    async getBoards() {
        return this.fetch<any[]>('/members/me/boards');
    }

    async createCard(listId: string, name: string, desc?: string) {
        return this.fetch<any>('/cards', {
            method: 'POST',
            body: JSON.stringify({
                idList: listId,
                name,
                desc
            }),
            headers: {
                'Content-Type': 'application/json'
            } // Note: Trello often expects query params for POST too, but body works for some endpoints if JSON supported. 
            // Safer to use URLSearchParams for Trello POSTs usually, but let's try JSON first or switch to URL params for body.
        });
        // Logic check: Trello REST API creates card via query params usually for simple fields? 
        // Docs say: POST /1/cards ... arguments can be in query string or body.
    }
}

export async function getTrelloClientForUser(userId: string): Promise<TrelloClient | null> {
    try {
        const doc = await db.collection("users").doc(userId).collection("integrations").doc("trello").get();
        if (!doc.exists) return null;

        const data = doc.data();
        if (!data || !data.accessToken) return null;
        // Note: We'll store the 'token' as 'accessToken' to be consistent. 
        // And we typically need the API Key too. 
        // The API Key is usually global for the app (Environment Variable), 
        // while the Token is per user.

        const apiKey = process.env.NEXT_PUBLIC_TRELLO_API_KEY || process.env.TRELLO_API_KEY;
        if (!apiKey) {
            console.error("Missing TRELLO_API_KEY");
            return null;
        }

        const decryptedToken = decrypt(data.accessToken);
        return new TrelloClient(apiKey, decryptedToken);

    } catch (error) {
        console.error(`[Trello Client] Failed to get client for user ${userId}:`, error);
        return null;
    }
}
