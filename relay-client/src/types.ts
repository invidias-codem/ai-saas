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
  | string;

export interface RelayCommand {
    id: string;
    userId: string;
    deviceId: string;
    actionType: RelayActionType;
    payload: Record<string, any>;
    requiresApproval: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'executing' | 'success' | 'failure';
    createdAt?: string;
    updatedAt?: string;
}

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
