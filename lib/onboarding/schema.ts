import { z } from 'zod';

export const domainIntentSchema = z.object({
  objective: z.string().min(5, 'Please describe your primary objective.').max(500),
  industry: z.string().min(2, 'Industry or niche is required.').max(120),
  role: z.string().max(120).optional(),
  constraints: z.string().max(500).optional(),
});

export type DomainIntent = z.infer<typeof domainIntentSchema>;

export const onboardingSourceSchema = z.object({
  kind: z.enum(['url', 'note', 'paste']),
  title: z.string().max(200).optional(),
  text: z.string().optional(),
  url: z.string().url().max(2000).optional(),
});

export type OnboardingSource = z.infer<typeof onboardingSourceSchema>;
