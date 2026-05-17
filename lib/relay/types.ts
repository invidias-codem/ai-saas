import type { UcolDeviceContext } from '../ucol/routing/types';

export type RelayActionType =
  | 'notify'
  | 'open_url'
  | 'copy_to_clipboard'
  | 'write_file'
  | 'read_file'
  | 'open_app'
  | 'run_script'
  | 'send_message'
  | 'calendar_create'
  | 'browser_fill'
  | 'take_screenshot'
  | string; // Fallback for extensibility

export interface RelayCommandResult {
  commandId: string;
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executedAt: string;
  durationMs: number;
  userApproved?: boolean;
}

export interface ObservationPayload {
  activeApp?: string;
  screenContextSummary?: string;
  fileContext?: Record<string, any>;
  networkClass?: string;
  batteryState?: string;
}

export interface RelaySession {
    id?: string;
    userId: string;
    deviceId?: string;
    taskDescription: string;
    responseSummary: string;
    rawTrajectory?: any; // The full thought/action/observation sequence
    rewardScore?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface RelaySkill {
    id: string;
    version: number;
    triggerPattern: string;
    confidenceThreshold: number;
    requiresApproval: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface RelayCommand {
    id?: string;
    userId: string;
    deviceId: string;
    actionType: string;
    payload: Record<string, any>;
    requiresApproval: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'executing' | 'success' | 'failure';
    createdAt?: string;
    updatedAt?: string;
}

export interface SkillExtractionResult {
    passedGate: boolean;
    reason?: string;
    skillId?: string;
    skillContent?: string;
    triggerPattern?: string;
    confidenceThreshold?: number;
    requiresApproval?: boolean;
}

// Ensure the RelayClient implements safety overrides locally
export const SAFE_WITHOUT_APPROVAL_ACTIONS = [
    'read_file',
    'list_directory',
    'get_system_info',
    'echo'
];
