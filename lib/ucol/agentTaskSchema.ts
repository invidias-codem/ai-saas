import { z } from 'zod';

export const AgentTaskTypeSchema = z.enum(['reasoning', 'generation', 'evaluation', 'transformation', 'blog_post']);
export type AgentTaskType = z.infer<typeof AgentTaskTypeSchema>;

export const RoutingTierSchema = z.enum(['fast', 'balanced', 'deep']).optional();
export type RoutingTier = z.infer<typeof RoutingTierSchema>;

export const CreateAgentTaskSchema = z.object({
  task_type: AgentTaskTypeSchema,
  input: z.string().min(1).max(50000),
  context: z.string().max(20000).optional(),
  routing_tier: RoutingTierSchema,
  model_preference: z.string().max(100).optional(),
});
export type CreateAgentTask = z.infer<typeof CreateAgentTaskSchema>;

export const AgentTaskStatusSchema = z.enum(['queued', 'running', 'pending_approval', 'completed', 'failed']);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

export interface AgentTaskRecord {
  id: string;
  user_id: string;
  workspace_id?: string;
  task_type: AgentTaskType;
  input: string;
  context?: string;
  routing_tier?: RoutingTier;
  model_preference?: string;
  status: AgentTaskStatus;
  result?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
