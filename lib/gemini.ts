export interface HistoryPart {
    text: string;
}

export interface HistoryItem {
    role: string;
    parts: HistoryPart[];
}

/**
 * Sanitizes the chat history for Gemini API.
 * 1. Merges consecutive messages of the same role.
 * 2. Ensures the history ends with a 'model' message if we are about to send a 'user' message.
 *    If the last message is 'user', it returns the modified history (popped) and the text 
 *    that should be prepended to the new prompt.
 * 
 * @param history The raw history array (including system, greeting, and conversation)
 * @returns An object containing the properly sanitized history and any text to prepend to the next prompt.
 */
export function sanitizeHistory(history: HistoryItem[]): {
    sanitizedHistory: HistoryItem[];
    prependToPrompt: string;
} {
    const sanitizedHistory: HistoryItem[] = [];
    let prependToPrompt = "";

    // 1. Merge consecutive messages
    for (const msg of history) {
        if (sanitizedHistory.length === 0) {
            sanitizedHistory.push(JSON.parse(JSON.stringify(msg))); // Deep copy to avoid mutating original
        } else {
            const lastMsg = sanitizedHistory[sanitizedHistory.length - 1];
            if (lastMsg.role === msg.role) {
                // Merge parts if roles match
                lastMsg.parts[0].text += "\n\n" + msg.parts[0].text;
            } else {
                sanitizedHistory.push(JSON.parse(JSON.stringify(msg)));
            }
        }
    }

    // 2. Ensure strict alternation for the final step
    // The history passed to startChat MUST end with a MODEL message if we are sending a USER message.
    if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
        const lastHistoryMsg = sanitizedHistory.pop();
        if (lastHistoryMsg) {
            prependToPrompt = lastHistoryMsg.parts[0].text;
        }
    }

    return { sanitizedHistory, prependToPrompt };
}
