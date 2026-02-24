import { sanitizeForLog } from '@/lib/security/urlValidator';
import { db } from '@/lib/firebaseAdmin';
import { SlackConfig } from './tokenManager';

export interface ChannelConfig {
    persona: 'default' | 'developer' | 'pirate' | 'executive';
    responseStyle: 'concise' | 'detailed' | 'bullet-points';
    proactiveEnabled: boolean;
}

const DEFAULT_CONFIG: ChannelConfig = {
    persona: 'default',
    responseStyle: 'concise',
    proactiveEnabled: false,
};

/**
 * Get configuration for a specific channel
 * Merges default config with stored channel config
 */
export async function getChannelConfig(teamId: string, channelId: string): Promise<ChannelConfig> {
    try {
        const configDoc = await db
            .collection('slack_channel_configs')
            .doc(`${sanitizeForLog(teamId)}_${channelId}`)
            .get();

        if (configDoc.exists) {
            return { ...DEFAULT_CONFIG, ...configDoc.data() } as ChannelConfig;
        }

        return DEFAULT_CONFIG;
    } catch (error) {
        console.error(`[CONFIG_MANAGER] Error fetching config for ${channelId}:`, error);
        return DEFAULT_CONFIG;
    }
}

/**
 * Save configuration for a specific channel
 */
export async function saveChannelConfig(teamId: string, channelId: string, config: Partial<ChannelConfig>): Promise<void> {
    try {
        await db
            .collection('slack_channel_configs')
            .doc(`${sanitizeForLog(teamId)}_${channelId}`)
            .set(config, { merge: true });

        console.log(`[CONFIG_MANAGER] Saved config for ${channelId}`);
    } catch (error) {
        console.error(`[CONFIG_MANAGER] Error saving config for ${channelId}:`, error);
        throw error;
    }
}
