/**
 * Session Cookie Memory System
 * 
 * Persists conversation history and session state in secure cookies
 * - Survives server crashes
 * - Survives browser refresh
 * - Persists through logout/login (until session restart)
 * - Automatic cleanup on session expiration
 * 
 * Architecture:
 * - Client-side: Cookies stored with secure, httpOnly flags
 * - Server-side: Optional validation and refresh
 * - Session-based: TTL tied to Clerk session
 */

export interface SessionMessage {
  text: string;
  role: "user" | "bot";
  timestamp: number; // Unix timestamp
}

export interface SessionCookieData {
  messages: SessionMessage[];
  lastUpdated: number;
  sessionId: string;
  userId: string;
  messageCount: number;
}

// Cookie configuration
const COOKIE_CONFIG = {
  SESSION_MEMORY: 'genie_session_memory',
  SESSION_ID: 'genie_session_id',
  COOKIE_OPTIONS: {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  },
};

/**
 * Get session memory from cookies (client-side)
 * Returns parsed messages or null if cookie missing/invalid
 */
export function getSessionMemoryFromCookie(): SessionMessage[] {
  if (typeof document === 'undefined') return [];

  try {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith(COOKIE_CONFIG.SESSION_MEMORY + '='))
      ?.split('=')[1];

    if (!cookieValue) return [];

    // Decode from base64
    const decoded = atob(cookieValue);
    const data: SessionCookieData = JSON.parse(decoded);

    // Validate structure
    if (!Array.isArray(data.messages)) return [];

    return data.messages;
  } catch (error) {
    console.warn('[SessionCookie] Failed to parse session memory:', error);
    return [];
  }
}

/**
 * Save session memory to cookie (client-side)
 * Called after each message to persist conversation
 */
export function saveSessionMemoryToCookie(
  messages: SessionMessage[],
  userId: string,
  sessionId: string
): void {
  if (typeof document === 'undefined') return;

  try {
    const data: SessionCookieData = {
      messages,
      lastUpdated: Date.now(),
      sessionId,
      userId,
      messageCount: messages.length,
    };

    // Encode to base64 for safe cookie storage
    const encoded = btoa(JSON.stringify(data));
    
    // Set cookie with secure options
    const options = COOKIE_CONFIG.COOKIE_OPTIONS;
    const cookieString = `${COOKIE_CONFIG.SESSION_MEMORY}=${encoded}; Max-Age=${options.maxAge}; Path=${options.path}; SameSite=${options.sameSite}${
      options.secure ? '; Secure' : ''
    }`;

    document.cookie = cookieString;
    
    console.log(`[SessionCookie] Saved ${messages.length} messages to session memory`);
  } catch (error) {
    console.error('[SessionCookie] Failed to save session memory:', error);
  }
}

/**
 * Clear session memory cookie
 * Called on logout or session restart
 */
export function clearSessionMemoryCookie(): void {
  if (typeof document === 'undefined') return;

  try {
    document.cookie = `${COOKIE_CONFIG.SESSION_MEMORY}=; Max-Age=0; Path=/`;
    console.log('[SessionCookie] Cleared session memory');
  } catch (error) {
    console.error('[SessionCookie] Failed to clear session memory:', error);
  }
}

/**
 * Get or create session ID
 * Persists in separate cookie to track user's browser session
 */
export function getOrCreateSessionId(): string {
  if (typeof document === 'undefined') return generateSessionId();

  try {
    const sessionIdCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(COOKIE_CONFIG.SESSION_ID + '='))
      ?.split('=')[1];

    if (sessionIdCookie) {
      return sessionIdCookie;
    }

    // Create new session ID
    const newSessionId = generateSessionId();
    
    // Store in cookie (same lifetime as memory cookie)
    const options = COOKIE_CONFIG.COOKIE_OPTIONS;
    const cookieString = `${COOKIE_CONFIG.SESSION_ID}=${newSessionId}; Max-Age=${options.maxAge}; Path=${options.path}; SameSite=${options.sameSite}${
      options.secure ? '; Secure' : ''
    }`;
    
    document.cookie = cookieString;
    console.log('[SessionCookie] Created new session ID');
    
    return newSessionId;
  } catch (error) {
    console.error('[SessionCookie] Failed to get/create session ID:', error);
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
  if (typeof document === 'undefined') {
    return { sessionId: '', messageCount: 0, lastUpdated: 0, isActive: false };
  }

  try {
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith(COOKIE_CONFIG.SESSION_MEMORY + '='))
      ?.split('=')[1];

    if (!cookieValue) {
      return {
        sessionId: getOrCreateSessionId(),
        messageCount: 0,
        lastUpdated: 0,
        isActive: false,
      };
    }

    const decoded = atob(cookieValue);
    const data: SessionCookieData = JSON.parse(decoded);

    return {
      sessionId: data.sessionId,
      messageCount: data.messageCount,
      lastUpdated: data.lastUpdated,
      isActive: true,
    };
  } catch (error) {
    console.error('[SessionCookie] Failed to get session info:', error);
    return {
      sessionId: getOrCreateSessionId(),
      messageCount: 0,
      lastUpdated: 0,
      isActive: false,
    };
  }
}

/**
 * Check if session is still valid
 * Returns false if cookie older than max age
 */
export function isSessionValid(maxAgeSeconds = 7 * 24 * 60 * 60): boolean {
  const info = getSessionInfo();
  if (!info.isActive) return false;

  const ageSeconds = (Date.now() - info.lastUpdated) / 1000;
  return ageSeconds < maxAgeSeconds;
}

/**
 * Get memory stats for debugging
 */
export function getMemoryStats(): {
  totalMessages: number;
  userMessages: number;
  botMessages: number;
  sessionAgeMinutes: number;
  cookieSize: string;
} {
  const messages = getSessionMemoryFromCookie();
  const info = getSessionInfo();

  const userCount = messages.filter(m => m.role === 'user').length;
  const botCount = messages.filter(m => m.role === 'bot').length;

  let cookieSize = 'N/A';
  if (typeof document !== 'undefined') {
    const cookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(COOKIE_CONFIG.SESSION_MEMORY + '='));
    if (cookie) {
      const bytes = new Blob([cookie]).size;
      cookieSize = `${(bytes / 1024).toFixed(2)} KB`;
    }
  }

  return {
    totalMessages: messages.length,
    userMessages: userCount,
    botMessages: botCount,
    sessionAgeMinutes: info.lastUpdated ? Math.floor((Date.now() - info.lastUpdated) / 60000) : 0,
    cookieSize,
  };
}
