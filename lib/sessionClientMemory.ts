/**
 * Session Client Memory System
 * 
 * Persists conversation history and session state in LocalStorage
 * - Survives browser refresh
 * - Persists through logout/login (until session restart)
 * - Automatic cleanup on session expiration
 * - Supports large conversation history (up to ~5MB)
 * 
 * Architecture:
 * - Client-side: LocalStorage for content, Cookie for Session ID
 * - Session-based: TTL tied to last activity
 */

export interface SessionMessage {
    text: string;
    role: "user" | "bot";
    timestamp: number; // Unix timestamp
}

export interface SessionStorageData {
    messages: SessionMessage[];
    lastUpdated: number;
    sessionId: string;
    userId: string;
    messageCount: number;
    activeConversationId?: string; // ID of the current conversation in Firebase
}

// Storage configuration
const STORAGE_CONFIG = {
    SESSION_MEMORY_KEY: 'genie_session_memory', // Key for LocalStorage
    SESSION_ID_COOKIE: 'genie_session_id',      // Key for Cookie (ID only)
    COOKIE_OPTIONS: {
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
    },
};

/**
 * Get session memory from LocalStorage (client-side)
 * Returns parsed messages or [] if missing/invalid
 */
export function getSessionMemoryFromStorage(): SessionMessage[] {
    if (typeof window === 'undefined') return [];

    try {
        const storedValue = localStorage.getItem(STORAGE_CONFIG.SESSION_MEMORY_KEY);

        if (!storedValue) return [];

        const data: SessionStorageData = JSON.parse(storedValue);

        // Validate structure
        if (!Array.isArray(data.messages)) return [];

        return data.messages;
    } catch (error) {
        console.warn('[SessionStorage] Failed to parse session memory:', error);
        return [];
    }
}

/**
 * Save session memory to LocalStorage (client-side)
 * Called after each message to persist conversation
 */
export function saveSessionMemoryToStorage(
    messages: SessionMessage[],
    userId: string,
    sessionId: string
): void {
    if (typeof window === 'undefined') return;

    try {
        const data: SessionStorageData = {
            messages,
            lastUpdated: Date.now(),
            sessionId,
            userId,
            messageCount: messages.length,
        };

        localStorage.setItem(STORAGE_CONFIG.SESSION_MEMORY_KEY, JSON.stringify(data));

        console.log(`[SessionStorage] Saved ${messages.length} messages to local storage`);
    } catch (error) {
        console.error('[SessionStorage] Failed to save session memory:', error);
    }
}

/**
 * Clear session memory
 * Called on logout or session restart
 */
export function clearSessionMemoryStorage(): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(STORAGE_CONFIG.SESSION_MEMORY_KEY);
        console.log('[SessionStorage] Cleared session memory');
    } catch (error) {
        console.error('[SessionStorage] Failed to clear session memory:', error);
    }
}

/**
 * Get or create session ID
 * Persists in cookie to track user's browser session across tabs/requests if needed
 */
export function getOrCreateSessionId(): string {
    if (typeof document === 'undefined') return generateSessionId();

    try {
        const sessionIdCookie = document.cookie
            .split('; ')
            .find(row => row.startsWith(STORAGE_CONFIG.SESSION_ID_COOKIE + '='))
            ?.split('=')[1];

        if (sessionIdCookie) {
            return sessionIdCookie;
        }

        // Create new session ID
        const newSessionId = generateSessionId();

        // Store in cookie (keep ID in cookie for potential server tracking)
        const options = STORAGE_CONFIG.COOKIE_OPTIONS;
        const cookieString = `${STORAGE_CONFIG.SESSION_ID_COOKIE}=${newSessionId}; Max-Age=${options.maxAge}; Path=${options.path}; SameSite=${options.sameSite}${options.secure ? '; Secure' : ''}`;

        document.cookie = cookieString;
        console.log('[SessionStorage] Created new session ID');

        return newSessionId;
    } catch (error) {
        console.error('[SessionStorage] Failed to get/create session ID:', error);
        return generateSessionId();
    }
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get session info (metadata only)
 */
export function getSessionInfo(): {
    sessionId: string;
    messageCount: number;
    lastUpdated: number;
    isActive: boolean;
} {
    if (typeof window === 'undefined') {
        return { sessionId: '', messageCount: 0, lastUpdated: 0, isActive: false };
    }

    try {
        const storedValue = localStorage.getItem(STORAGE_CONFIG.SESSION_MEMORY_KEY);

        if (!storedValue) {
            return {
                sessionId: getOrCreateSessionId(),
                messageCount: 0,
                lastUpdated: 0,
                isActive: false,
            };
        }

        const data: SessionStorageData = JSON.parse(storedValue);

        return {
            sessionId: data.sessionId,
            messageCount: data.messageCount,
            lastUpdated: data.lastUpdated,
            isActive: true,
        };
    } catch (error) {
        console.error('[SessionStorage] Failed to get session info:', error);
        return {
            sessionId: getOrCreateSessionId(),
            messageCount: 0,
            lastUpdated: 0,
            isActive: false,
        };
    }
}

/**
 * Get memory stats for debugging
 */
export function getMemoryStats(): {
    totalMessages: number;
    userMessages: number;
    botMessages: number;
    sessionAgeMinutes: number;
    storageSize: string;
} {
    const messages = getSessionMemoryFromStorage();
    const info = getSessionInfo();

    const userCount = messages.filter(m => m.role === 'user').length;
    const botCount = messages.filter(m => m.role === 'bot').length;

    let storageSize = 'N/A';
    if (typeof window !== 'undefined') {
        const value = localStorage.getItem(STORAGE_CONFIG.SESSION_MEMORY_KEY) || '';
        const bytes = new Blob([value]).size;
        storageSize = `${(bytes / 1024).toFixed(2)} KB`;
    }

    return {
        totalMessages: messages.length,
        userMessages: userCount,
        botMessages: botCount,
        sessionAgeMinutes: info.lastUpdated ? Math.floor((Date.now() - info.lastUpdated) / 60000) : 0,
        storageSize,
    };
}
