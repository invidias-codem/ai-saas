import {
  GenieUniversalImport,
  ImportedConversation,
  ImportedMessage,
  PlatformParser,
  PreviewableParser,
  SupportedPlatform,
  Role
} from '@/lib/types/imports';

// ─── Claude Export Types (reverse-engineered from actual exports) ──────────────
// Claude exports two known formats:
// Format A: claude.ai data export (array of conversations with chat_messages)
// Format B: API-style (content arrays with text/tool_use blocks)

interface ClaudeExportV1 {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessageV1[];
}

interface ClaudeMessageV1 {
  uuid: string;
  sender: 'human' | 'assistant';
  text: string;
  created_at: string;
  updated_at: string;
  attachments?: ClaudeAttachment[];
  files?: ClaudeFile[];
}

interface ClaudeAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  extracted_content?: string;
}

interface ClaudeFile {
  file_name: string;
  file_type: string;
  file_size: number;
  extracted_content?: string;
}

// Format B — API/newer format uses content blocks
interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image' | 'thinking';
  text?: string;
  id?: string;
  name?: string;         // tool name
  input?: unknown;       // tool inputs
  content?: string | ClaudeContentBlock[]; // tool_result content
  source?: { type: string; media_type: string; data: string }; // image
  thinking?: string;
}

interface ClaudeMessageV2 {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
  created_at?: string;
  model?: string;
}

interface ClaudeConversationV2 {
  id: string;
  title?: string;
  created_at: string;
  updated_at?: string;
  messages: ClaudeMessageV2[];
  model?: string;
}

// ─── Parser ────────────────────────────────────────────────────────────────────

export class AnthropicParser implements PreviewableParser {
  platform: SupportedPlatform = 'anthropic';

  validateFormat(data: unknown): boolean {
    if (!Array.isArray(data) || data.length === 0) return false;
    const first = data[0];
    if (!first || typeof first !== 'object') return false;
    // Format A: has uuid + chat_messages
    if ('uuid' in first && 'chat_messages' in first) return true;
    // Format B: has messages array with role field
    if ('messages' in first && Array.isArray((first as any).messages)) {
      const firstMsg = (first as any).messages[0];
      return firstMsg && 'role' in firstMsg;
    }
    return false;
  }

  parse(data: unknown): GenieUniversalImport {
    const raw = data as any[];
    const conversations: ImportedConversation[] = [];

    for (const item of raw) {
      try {
        // Detect format
        if ('chat_messages' in item) {
          conversations.push(this.parseV1(item as ClaudeExportV1));
        } else if ('messages' in item) {
          conversations.push(this.parseV2(item as ClaudeConversationV2));
        }
      } catch (e) {
        console.warn('[AnthropicParser] Failed to parse conversation:', e);
      }
    }

    return {
      version: '1.0',
      source: 'anthropic',
      exportedAt: new Date().toISOString(),
      conversations,
    };
  }

  // Format A: claude.ai data export
  private parseV1(raw: ClaudeExportV1): ImportedConversation {
    return {
      externalId: raw.uuid,
      title: raw.name || 'Untitled Chat',
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      messages: raw.chat_messages.map(msg => this.parseMessageV1(msg)),
    };
  }

  private parseMessageV1(msg: ClaudeMessageV1): ImportedMessage {
    const role: Role = msg.sender === 'human' ? 'user' : 'assistant';
    const attachments: ImportedMessage['attachments'] = [];

    // Handle file attachments
    for (const att of msg.attachments || []) {
      attachments.push({
        type: att.file_type?.startsWith('image/') ? 'image' : 'file',
        name: att.file_name,
        mimeType: att.file_type,
        content: att.extracted_content,
      });
    }
    for (const f of msg.files || []) {
      attachments.push({
        type: f.file_type?.startsWith('image/') ? 'image' : 'file',
        name: f.file_name,
        mimeType: f.file_type,
        content: f.extracted_content,
      });
    }

    return {
      role,
      content: msg.text || '',
      timestamp: msg.created_at,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  // Format B: API / newer format with content blocks
  private parseV2(raw: ClaudeConversationV2): ImportedConversation {
    return {
      externalId: raw.id,
      title: raw.title || 'Untitled Chat',
      createdAt: raw.created_at,
      updatedAt: raw.updated_at || raw.created_at,
      messages: raw.messages.map(msg => this.parseMessageV2(msg, raw.model)),
    };
  }

  private parseMessageV2(msg: ClaudeMessageV2, defaultModel?: string): ImportedMessage {
    const role: Role = msg.role === 'user' ? 'user' : 'assistant';
    const attachments: ImportedMessage['attachments'] = [];
    let textContent = '';
    let toolName: string | undefined;
    let toolInputs: unknown;

    if (typeof msg.content === 'string') {
      textContent = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        switch (block.type) {
          case 'text':
            textContent += (block.text || '');
            break;
          case 'thinking':
            // Claude's extended thinking — store as metadata-only (don't pollute content)
            break;
          case 'tool_use':
            toolName = block.name;
            toolInputs = block.input;
            textContent += `[Tool: ${block.name}]`;
            break;
          case 'tool_result':
            const resultContent = typeof block.content === 'string'
              ? block.content
              : (block.content as ClaudeContentBlock[] || []).map(b => b.text || '').join('');
            textContent += `[Tool Result: ${resultContent}]`;
            break;
          case 'image':
            if (block.source?.data) {
              attachments.push({
                type: 'image',
                mimeType: block.source.media_type,
                content: block.source.data, // base64
              });
            }
            break;
        }
      }
    }

    return {
      role,
      content: textContent.trim(),
      timestamp: msg.created_at || new Date().toISOString(),
      model: msg.role === 'assistant' ? (msg.model || defaultModel || 'claude') : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      metadata: toolName ? { toolName, toolInputs } : undefined,
    };
  }

  preview(data: unknown): { valid: boolean; platform: string; counts: { conversations: number; messages: number } } {
    const isValid = this.validateFormat(data);
    if (!isValid) return { valid: false, platform: this.platform, counts: { conversations: 0, messages: 0 } };

    const raw = data as any[];
    let messageCount = 0;
    for (const conv of raw) {
      messageCount += (conv.chat_messages || conv.messages || []).length;
    }

    return {
      valid: true,
      platform: this.platform,
      counts: { conversations: raw.length, messages: messageCount },
    };
  }
}
