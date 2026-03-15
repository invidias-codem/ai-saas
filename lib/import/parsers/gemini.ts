import {
  GenieUniversalImport,
  ImportedConversation,
  ImportedMessage,
  PlatformParser,
  PreviewableParser,
  SupportedPlatform,
  Role
} from '@/lib/types/imports';

// ─── Gemini Export Reality Check ───────────────────────────────────────────────
// Google Takeout for Gemini (as of 2024-2026) exports Gems (custom instructions)
// NOT full conversation history. This parser handles:
//   A) Gemini API conversation format (used in apps built on the API)
//   B) Gems/instructions format from Takeout
//   C) Generic message array format (community export tools)
//   D) Google AI Studio exported conversations

interface GeminiAPIConversation {
  conversationId?: string;
  title?: string;
  createTime?: string;
  updateTime?: string;
  messages?: GeminiAPIMessage[];
  // Older API format
  history?: GeminiAPIMessage[];
}

interface GeminiAPIMessage {
  role?: 'user' | 'model';
  author?: string;
  parts?: GeminiPart[];
  content?: string;
  timestamp?: string;
  createTime?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}

// Takeout / Gems format
interface GeminiGem {
  gemId?: string;
  name?: string;
  systemInstruction?: string | { parts: GeminiPart[] };
  createTime?: string;
}

// AI Studio export format
interface AIStudioExport {
  runSettings?: {
    model?: string;
    systemInstruction?: { parts: GeminiPart[] };
  };
  history?: GeminiAPIMessage[];
  chunks?: { role?: string; text?: string }[];
}

// ─── Parser ────────────────────────────────────────────────────────────────────

export class GeminiParser implements PreviewableParser {
  platform: SupportedPlatform = 'gemini';

  validateFormat(data: unknown): boolean {
    if (Array.isArray(data)) {
      const first = data[0];
      if (!first || typeof first !== 'object') return false;
      // API conversation list
      if ('conversationId' in first || 'history' in first || 'messages' in first) return true;
      // Gems list
      if ('gemId' in first || 'systemInstruction' in first) return true;
      // Generic with role+parts
      if ('parts' in first && ('role' in first || 'author' in first)) return true;
    }
    // AI Studio single export object
    if (typeof data === 'object' && data !== null) {
      const obj = data as any;
      if ('runSettings' in obj || 'history' in obj || 'chunks' in obj) return true;
    }
    return false;
  }

  parse(data: unknown): GenieUniversalImport {
    const conversations: ImportedConversation[] = [];

    // Single AI Studio export
    if (!Array.isArray(data) && typeof data === 'object' && data !== null) {
      const studio = data as AIStudioExport;
      const conv = this.parseAIStudio(studio);
      if (conv) conversations.push(conv);
      return {
        version: '1.0',
        source: 'gemini',
        exportedAt: new Date().toISOString(),
        conversations,
      };
    }

    const raw = data as any[];

    // Detect if this is a Gems export (no conversations, just instructions)
    if (raw.length > 0 && ('gemId' in raw[0] || 'systemInstruction' in raw[0])) {
      // Convert Gems to preferences/custom instructions — they're not conversations
      // Return empty conversations but surface the Gems as preferences
      const preferences = raw.map(gem => ({
        communicationStyle: gem.name || 'Imported Gem',
        customInstructions: this.extractGemInstruction(gem),
      }));

      return {
        version: '1.0',
        source: 'gemini',
        exportedAt: new Date().toISOString(),
        conversations: [],
        userPreferences: preferences,
        udif: {
          sovereigntyMode: 'user-owned',
        },
      };
    }

    // Standard conversation list
    for (const item of raw) {
      try {
        const conv = this.parseConversation(item);
        if (conv.messages.length > 0) conversations.push(conv);
      } catch (e) {
        console.warn('[GeminiParser] Failed to parse conversation:', e);
      }
    }

    return {
      version: '1.0',
      source: 'gemini',
      exportedAt: new Date().toISOString(),
      conversations,
    };
  }

  private parseConversation(raw: GeminiAPIConversation): ImportedConversation {
    const rawMessages = raw.messages || raw.history || [];
    const messages = rawMessages.map(m => this.parseMessage(m)).filter(m => m.content.trim() !== '');

    return {
      externalId: raw.conversationId,
      title: raw.title || 'Gemini Conversation',
      createdAt: raw.createTime || raw.updateTime || new Date().toISOString(),
      updatedAt: raw.updateTime || raw.createTime || new Date().toISOString(),
      messages,
    };
  }

  private parseMessage(msg: GeminiAPIMessage): ImportedMessage {
    const authorStr = msg.role || msg.author || 'user';
    const role: Role = (authorStr === 'model' || authorStr === 'assistant') ? 'assistant' : 'user';
    const attachments: ImportedMessage['attachments'] = [];

    let textContent = msg.content || '';

    if (msg.parts && msg.parts.length > 0) {
      const textParts: string[] = [];
      for (const part of msg.parts) {
        if (part.text) {
          textParts.push(part.text);
        } else if (part.inlineData) {
          attachments.push({
            type: part.inlineData.mimeType.startsWith('image/') ? 'image' : 'file',
            mimeType: part.inlineData.mimeType,
            content: part.inlineData.data,
          });
        } else if (part.fileData) {
          attachments.push({
            type: part.fileData.mimeType.startsWith('image/') ? 'image' : 'file',
            mimeType: part.fileData.mimeType,
            url: part.fileData.fileUri,
          });
        }
      }
      textContent = textParts.join('');
    }

    const hasTimestamp = Boolean(msg.timestamp || msg.createTime);
    return {
      role,
      content: textContent,
      timestamp: msg.timestamp || msg.createTime || new Date().toISOString(),
      model: role === 'assistant' ? 'gemini' : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      metadata: hasTimestamp ? undefined : { timestampUnknown: true },
    };
  }

  private parseAIStudio(studio: AIStudioExport): ImportedConversation | null {
    const messages: ImportedMessage[] = [];

    // System instruction as first message context
    const sysInstruction = studio.runSettings?.systemInstruction?.parts
      ?.map(p => p.text || '')
      .join('') || '';

    const history = studio.history || studio.chunks?.map(c => ({
      role: c.role as 'user' | 'model',
      parts: [{ text: c.text || '' }],
    })) || [];

    for (const msg of history) {
      const parsed = this.parseMessage(msg);
      if (parsed.content.trim()) messages.push(parsed);
    }

    if (messages.length === 0) return null;

    return {
      title: 'AI Studio Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages,
      metadata: {
        model: studio.runSettings?.model,
        systemInstruction: sysInstruction || undefined,
      },
    };
  }

  private extractGemInstruction(gem: GeminiGem): string {
    if (!gem.systemInstruction) return '';
    if (typeof gem.systemInstruction === 'string') return gem.systemInstruction;
    return gem.systemInstruction.parts?.map(p => p.text || '').join('') || '';
  }

  preview(data: unknown): { valid: boolean; platform: string; counts: { conversations: number; messages: number } } {
    const isValid = this.validateFormat(data);
    if (!isValid) return { valid: false, platform: this.platform, counts: { conversations: 0, messages: 0 } };

    if (!Array.isArray(data)) return { valid: true, platform: this.platform, counts: { conversations: 1, messages: 0 } };

    const raw = data as any[];
    let messageCount = 0;
    for (const conv of raw) {
      messageCount += (conv.messages || conv.history || conv.chunks || []).length;
    }

    return {
      valid: true,
      platform: this.platform,
      counts: { conversations: raw.length, messages: messageCount },
    };
  }
}
