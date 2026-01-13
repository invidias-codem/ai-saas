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
    SESSION_MEMORY_PREFIX: 'genie_session_', // Prefix for conversation-scoped storage
    SESSION_ID_COOKIE: 'genie_session_id',      // Key for Cookie (ID only)
    COOKIE_OPTIONS: {
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/',
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
    },
};

/**
 * Get storage key for a specific conversation
 */
function getStorageKey(conversationId: string): string {
    return `${STORAGE_CONFIG.SESSION_MEMORY_PREFIX}${conversationId}`;
}

/**
 * Get session memory from LocalStorage (client-side)
 * Now conversation-scoped: only returns messages for the specified conversation
 */
export function getSessionMemoryFromStorage(conversationId?: string): SessionMessage[] {
    if (typeof window === 'undefined') return [];
    if (!conversationId) return []; // No conversation ID = no messages (prevents bleed)

    try {
        const storageKey = getStorageKey(conversationId);
        const storedValue = localStorage.getItem(storageKey);

        if (!storedValue) return [];

        const data: SessionStorageData = JSON.parse(storedValue);

        // Validate structure and conversation match
        if (!Array.isArray(data.messages)) return [];
        if (data.activeConversationId && data.activeConversationId !== conversationId) return [];

        return data.messages;
    } catch (error) {
        console.warn('[SessionStorage] Failed to parse session memory:', error);
        return [];
    }
}

/**
 * Save session memory to LocalStorage (client-side)
 * Now conversation-scoped: stores messages with conversation ID
 */
export function saveSessionMemoryToStorage(
    messages: SessionMessage[],
    userId: string,
    sessionId: string,
    conversationId?: string
): void {
    if (typeof window === 'undefined') return;
    if (!conversationId) return; // Must have conversation ID

    try {
        const data: SessionStorageData = {
            messages,
            lastUpdated: Date.now(),
            sessionId,
            userId,
            messageCount: messages.length,
            activeConversationId: conversationId,
        };

        const storageKey = getStorageKey(conversationId);
        localStorage.setItem(storageKey, JSON.stringify(data));

        console.log(`[SessionStorage] Saved ${messages.length} messages for conversation ${conversationId.substring(0, 8)}`);
    } catch (error) {
        console.error('[SessionStorage] Failed to save session memory:', error);
    }
}

/**
 * Clear session memory for a specific conversation
 * Pass conversationId to clear specific, or undefined to clear all
 */
export function clearSessionMemoryStorage(conversationId?: string): void {
    if (typeof window === 'undefined') return;

    try {
        if (conversationId) {
            const storageKey = getStorageKey(conversationId);
            localStorage.removeItem(storageKey);
            console.log(`[SessionStorage] Cleared session memory for ${conversationId.substring(0, 8)}`);
        } else {
            // Clear all conversation storage (for logout)
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(STORAGE_CONFIG.SESSION_MEMORY_PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`[SessionStorage] Cleared all session memory (${keysToRemove.length} conversations)`);
        }
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
 * Pass conversationId to get info for a specific conversation
 */
export function getSessionInfo(conversationId?: string): {
    sessionId: string;
    messageCount: number;
    lastUpdated: number;
    isActive: boolean;
} {
    if (typeof window === 'undefined') {
        return { sessionId: '', messageCount: 0, lastUpdated: 0, isActive: false };
    }

    try {
        const storageKey = conversationId ? getStorageKey(conversationId) : null;
        const storedValue = storageKey ? localStorage.getItem(storageKey) : null;

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
 * Pass conversationId to get stats for a specific conversation
 */
export function getMemoryStats(conversationId?: string): {
    totalMessages: number;
    userMessages: number;
    botMessages: number;
    sessionAgeMinutes: number;
    storageSize: string;
} {
    const messages = getSessionMemoryFromStorage(conversationId);
    const info = getSessionInfo(conversationId);

    const userCount = messages.filter(m => m.role === 'user').length;
    const botCount = messages.filter(m => m.role === 'bot').length;

    let storageSize = 'N/A';
    if (typeof window !== 'undefined' && conversationId) {
        const value = localStorage.getItem(getStorageKey(conversationId)) || '';
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
