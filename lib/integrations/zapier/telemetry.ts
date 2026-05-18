export function logZapierIntegrationEvent(event: string, details: Record<string, unknown>) {
  console.log(`[ZAPIER_INTEGRATION] ${event}`, details);
}
