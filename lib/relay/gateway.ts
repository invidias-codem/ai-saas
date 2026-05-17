import { supabaseAdmin } from '@/lib/supabaseClient';
import { RelayActionType } from './types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export class RelayGateway {
  /**
   * Queue a new command for a specific device.
   */
  static async queueCommand(params: {
    userId: string;
    deviceId: string;
    actionType: RelayActionType;
    payload: Record<string, unknown>;
    requiresApproval?: boolean;
  }): Promise<{ commandId: string | null; error: string | null }> {
    if (!supabaseAdmin) {
      return { commandId: null, error: 'Supabase admin client not configured' };
    }

    const commandId = uuidv4();

    const { error } = await supabaseAdmin.from('relay_commands').insert({
      id: commandId,
      user_id: params.userId,
      device_id: params.deviceId,
      action_type: params.actionType,
      payload: params.payload,
      requires_approval: params.requiresApproval ?? true,
      status: 'pending'
    });

    if (error) {
      logger.error('[RelayGateway] Error queueing command:', error);
      return { commandId: null, error: error.message };
    }

    return { commandId, error: null };
  }

  /**
   * Cancel a pending command.
   */
  static async cancelCommand(commandId: string): Promise<boolean> {
    if (!supabaseAdmin) return false;
    
    const { error } = await supabaseAdmin
      .from('relay_commands')
      .update({ status: 'cancelled' })
      .eq('id', commandId)
      .eq('status', 'pending');

    return !error;
  }

  /**
   * Assemble context for a device (combines latest observation + some memory).
   */
  static async assembleDeviceContext(userId: string, deviceId: string): Promise<Record<string, any>> {
    if (!supabaseAdmin) return {};

    // Get the latest observation
    const { data: observations } = await supabaseAdmin
      .from('relay_observations')
      .select('*')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestObservation = observations && observations.length > 0 ? observations[0] : null;

    // We can also fetch the user's active tasks or workflow state from memory here
    return {
      lastObservation: latestObservation,
      timestamp: new Date().toISOString()
    };
  }
}
