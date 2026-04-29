import { safeLocalStorage } from './safeStorage';

const ACTIVE_CONVERSATION_KEY = 'genie_active_conversation';

export interface ActiveConversation {
    id: string;
    title: string;
    createdAt: number;
}

/**
 * Set the active conversation ID
 * Called when user switches or creates a new conversation
 */
export function setActiveConversation(conversation: ActiveConversation): void {
    try {
        safeLocalStorage.setItem(ACTIVE_CONVERSATION_KEY, JSON.stringify(conversation));
        console.log(`[ConversationManager] Set active conversation: ${conversation.id}`);
    } catch (error) {
        console.error('[ConversationManager] Failed to set active conversation:', error);
    }
}

/**
 * Get the currently active conversation
 * Returns null if no conversation is set (fallback to "merged")
 */
export function getActiveConversation(): ActiveConversation | null {
    try {
        const stored = safeLocalStorage.getItem(ACTIVE_CONVERSATION_KEY);
        if (!stored) return null;

        return JSON.parse(stored) as ActiveConversation;
    } catch (error) {
        console.error('[ConversationManager] Failed to get active conversation:', error);
        return null;
    }
}

/**
 * Get the active conversation ID only
 * Returns null if no conversation is set (no fallback to "merged")
 */
export function getActiveConversationId(): string | null {
    const active = getActiveConversation();
    return active?.id || null;
}

/**
 * Clear the active conversation
 * Called when starting fresh or switching to default
 */
export function clearActiveConversation(): void {
    try {
        safeLocalStorage.removeItem(ACTIVE_CONVERSATION_KEY);
        console.log('[ConversationManager] Cleared active conversation');
    } catch (error) {
        console.error('[ConversationManager] Failed to clear active conversation:', error);
    }
}

/**
 * Create a new conversation via API
 * Returns the new conversation ID or null on failure
 */
export async function createNewConversation(options?: {
    title?: string;
    workspaceId?: string;
    operatingProfileId?: string;
}): Promise<ActiveConversation | null> {
    try {
        const payload = {
            ...(options?.title ? { title: options.title } : {}),
            ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
            ...(options?.operatingProfileId ? { operatingProfileId: options.operatingProfileId } : {}),
        };

        const response = await fetch('/api/conversations/new', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // Include cookies for Clerk auth
            body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
        });

        if (!response.ok) {
            console.error('[ConversationManager] Failed to create conversation:', response.statusText);
            return null;
        }

        const data = await response.json();

        const newConversation: ActiveConversation = {
            id: data.conversationId,
            title: data.title,
            createdAt: data.createdAt,
        };

        // Set as active conversation
        setActiveConversation(newConversation);

        return newConversation;
    } catch (error) {
        console.error('[ConversationManager] Error creating conversation:', error);
        return null;
    }
}

/**
 * Delete a conversation via API
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
    try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
            method: 'DELETE',
            credentials: 'include', // Include cookies for Clerk auth
        });

        if (!response.ok) {
            console.error('[ConversationManager] Failed to delete conversation:', response.statusText);
            return false;
        }

        // If we deleted the active conversation, clear it
        const active = getActiveConversation();
        if (active?.id === conversationId) {
            clearActiveConversation();
        }

        return true;
    } catch (error) {
        console.error('[ConversationManager] Error deleting conversation:', error);
        return false;
    }
}

/**
 * Fetch all conversations for the current user
 */
export async function fetchConversations(): Promise<{
    conversations: Array<{
        id: string;
        workspaceId?: string | null;
        title: string;
        messageCount: number;
        createdAt: number;
        lastUpdated: number;
        isArchived: boolean;
        preview?: string;
    }>;
    total: number;
} | null> {
    try {
        const response = await fetch('/api/conversations', {
            credentials: 'include', // Include cookies for Clerk auth
        });

        if (!response.ok) {
            console.error('[ConversationManager] Failed to fetch conversations:', response.statusText);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('[ConversationManager] Error fetching conversations:', error);
        return null;
    }
}

/**
 * Load a specific conversation's messages
 */
export async function loadConversation(conversationId: string): Promise<{
    id: string;
    title: string;
    messages: Array<{ text: string; role: string; timestamp: number }>;
    createdAt: number;
    lastUpdated: number;
} | null> {
    try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
            credentials: 'include', // Include cookies for Clerk auth
        });

        if (!response.ok) {
            console.error('[ConversationManager] Failed to load conversation:', response.statusText);
            return null;
        }

        const data = await response.json();

        // Update active conversation
        setActiveConversation({
            id: data.id,
            title: data.title,
            createdAt: data.createdAt,
        });

        return data;
    } catch (error) {
        console.error('[ConversationManager] Error loading conversation:', error);
        return null;
    }
}
