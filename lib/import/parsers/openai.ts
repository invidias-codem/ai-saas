import {
    GenieUniversalImport,
    ImportedConversation,
    ImportedMessage,
    PlatformParser,
    SupportedPlatform,
    Role
} from '@/lib/types/imports';

// --- OpenAI Internal Types (Reverse Engineered) ---

interface OpenAIExport {
    [key: string]: any; // Array of conversations usually
}

interface OpenAIConversation {
    id: string;
    title: string;
    create_time: number;
    update_time: number;
    mapping: { [nodeId: string]: OpenAINode };
    current_node: string;
}

interface OpenAINode {
    id: string;
    message?: OpenAIMessage | null;
    parent?: string;
    children: string[];
}

interface OpenAIMessage {
    id: string;
    author: { role: string; name?: string; metadata?: any };
    create_time: number;
    content: {
        content_type: 'text' | 'multimodal_text' | 'code' | 'execution_output' | string;
        parts: (string | OpenAIContentPart)[];
    };
    metadata?: any;
    status?: string;
}

interface OpenAIContentPart {
    content_type?: string;
    type?: string;
    text?: string;
    asset_pointer?: string;
    image_url?: { url: string };
    [key: string]: any;
}

// --- Parser Implementation ---

import { PreviewableParser } from '@/lib/types/imports';

export class OpenAIParser implements PreviewableParser {
    platform: SupportedPlatform = 'openai';

    validateFormat(data: unknown): boolean {
        if (!Array.isArray(data)) return false;
        // Check first item to see if it looks like an OpenAI conversation
        const firstItem = data[0];
        if (!firstItem || typeof firstItem !== 'object') return false;

        return 'mapping' in firstItem && 'current_node' in firstItem && 'create_time' in firstItem;
    }

    parse(data: unknown): GenieUniversalImport {
        const conversationsRaw = data as OpenAIConversation[];
        const conversations: ImportedConversation[] = [];

        for (const rawConv of conversationsRaw) {
            try {
                const conv = this.parseConversation(rawConv);
                conversations.push(conv);
            } catch (e) {
                console.warn(`Failed to parse OpenAI conversation ${rawConv.id}:`, e);
            }
        }

        return {
            version: "1.0",
            source: 'openai',
            exportedAt: new Date().toISOString(),
            conversations
        };
    }

    private parseConversation(raw: OpenAIConversation): ImportedConversation {
        // Handle missing or malformed conversation data
        if (!raw.mapping || !raw.current_node) {
            return {
                externalId: raw.id,
                title: raw.title || 'Untitled Conversation',
                createdAt: raw.create_time ? new Date(raw.create_time * 1000).toISOString() : new Date().toISOString(),
                updatedAt: raw.update_time ? new Date(raw.update_time * 1000).toISOString() : new Date().toISOString(),
                messages: [],
                metadata: {}
            };
        }

        const messages = this.traverseLineage(raw.mapping, raw.current_node);

        return {
            externalId: raw.id,
            title: raw.title || 'Untitled Conversation',
            createdAt: new Date(raw.create_time * 1000).toISOString(),
            updatedAt: new Date(raw.update_time * 1000).toISOString(),
            messages,
            metadata: {
                originalNode: raw.current_node
            }
        };
    }

    private traverseLineage(mapping: { [id: string]: OpenAINode }, currentNodeId: string): ImportedMessage[] {
        const messages: ImportedMessage[] = [];
        let nodeId: string | undefined = currentNodeId;

        while (nodeId) {
            const node: OpenAINode = mapping[nodeId];
            if (!node) break;

            if (node.message) {
                const msg = node.message;
                // Filter out system messages that aren't useful or empty messages
                if (msg.content && msg.content.parts && msg.content.parts.length > 0) {
                    // Check if it's a valid role we want to keep
                    const role = this.mapRole(msg.author.role);

                    // Skip hidden system messages unless they have content (sometimes OpenAI system messages are useful context, but usually hidden ones are noisy)
                    // Generally, we want 'user', 'assistant'. 'system' is okay if explicitly provided.
                    // OpenAI exports often contain a 'system' message at the root with standard prompt instructions which we might want to skip or keep.
                    // For now, let's keep everything that maps to a valid role.

                    if (role) {
                        const { content, attachments } = this.extractContentAndAttachments(msg.content);

                        // Check for metadata attachments (common in OpenAI exports for file uploads)
                        if (msg.metadata && Array.isArray(msg.metadata._attachments)) {
                            msg.metadata._attachments.forEach((att: any) => {
                                const type = att.mime_type?.startsWith('image/') ? 'image' : 'file';
                                attachments.push({
                                    type,
                                    url: att.url,
                                    mimeType: att.mime_type,
                                    // name: att.name // ImportedMessage schema doesn't have name yet, but we could add it to metadata if needed
                                });
                            });
                        }

                        // Only add if there is actual content or attachments
                        if (content.trim() || attachments.length > 0) {
                            // Handle invalid or missing timestamps
                            const timestamp = msg.create_time && msg.create_time > 0
                                ? new Date(msg.create_time * 1000).toISOString()
                                : new Date().toISOString();
                            messages.unshift({
                                role,
                                content,
                                timestamp,
                                attachments: attachments.length > 0 ? attachments : undefined
                            });
                        }
                    }
                }
            }

            nodeId = node.parent;
        }

        return messages;
    }

    private mapRole(openaiRole: string): Role | null {
        switch (openaiRole) {
            case 'user': return 'user';
            case 'assistant': return 'assistant';
            case 'tool': return 'system'; // Treat tool outputs as system or assistant? Usually part of assistant flow, but 'system' fits better for functional outputs.
            case 'system': return 'system';
            default: return null;
        }
    }

    private extractContentAndAttachments(contentObj: OpenAIMessage['content']): { content: string, attachments: NonNullable<ImportedMessage['attachments']> } {
        let textParts: string[] = [];
        const attachments: NonNullable<ImportedMessage['attachments']> = [];

        if (contentObj.content_type === 'text') {
            // standard text
            contentObj.parts.forEach(p => {
                if (typeof p === 'string') textParts.push(p);
            });
        } else if (contentObj.content_type === 'multimodal_text') {
            // Mixed content
            contentObj.parts.forEach(part => {
                if (typeof part === 'string') {
                    textParts.push(part);
                    return;
                }

                // Handle object parts
                if (part.content_type === 'image_asset_pointer' || part.type === 'image_url') {
                    const url = part.image_url?.url || part.asset_pointer; // asset_pointer is usually a reference like file-service://...
                    if (url) {
                        attachments.push({
                            type: 'image',
                            url: url.startsWith('file-service://') ? `openai-asset:${url}` : url
                            // Note: We might need a separate mechanism to actually fetch these assets if they aren't public URLs.
                            // For import purposes, we store the reference.
                        });
                    }
                } else if (part.type === 'text') {
                    if (part.text) textParts.push(part.text);
                }
            });
        } else if (contentObj.content_type === 'code') {
            // Code might be in parts or in a different field? usually parts[0] is the code
            if (contentObj.parts.length > 0 && typeof contentObj.parts[0] === 'string') {
                // Wrap in markdown code block if checking content_type explicitly, but usually it's better to just take the string
                textParts.push("```\n" + contentObj.parts[0] + "\n```");
            }
        } else {
            // Fallback for unknown types
            contentObj.parts.forEach(p => {
                if (typeof p === 'string') textParts.push(p);
                else if (p.text) textParts.push(p.text);
            });
        }

        return {
            content: textParts.join('').trim(),
            attachments
        };
    }

    /**
     * Lightweight preview of the import data found in the file.
     * Does not perform full parsing/normalization, just extraction of counts.
     */
    preview(data: unknown): { valid: boolean, platform: string, counts: { conversations: number, messages: number } } {
        const isValid = this.validateFormat(data);
        if (!isValid) {
            return {
                valid: false,
                platform: this.platform,
                counts: { conversations: 0, messages: 0 }
            };
        }

        const conversationsRaw = data as OpenAIConversation[];
        let messageCount = 0;

        // Rapidly estimate message count without full recursive traversal if possible,
        // but for accurate active-thread count, we need to follow the chain.
        // To be safe and fast for the UI, we'll do the traversal but skip heavy text processing.
        for (const conv of conversationsRaw) {
            if (!conv.current_node || !conv.mapping) continue;

            let nodeId: string | undefined = conv.current_node;
            while (nodeId) {
                const node: OpenAINode = conv.mapping[nodeId];
                if (!node) break;
                if (node.message) {
                    messageCount++;
                }
                nodeId = node.parent;
            }
        }

        return {
            valid: true,
            platform: this.platform,
            counts: {
                conversations: conversationsRaw.length,
                messages: messageCount
            }
        };
    }
}
