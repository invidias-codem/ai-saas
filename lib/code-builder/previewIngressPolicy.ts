/**
 * Phase 8G.0: deny shared preview access until independently enforced ingress.
 *
 * The public sandbox.domain(port) cannot be made private with a Clerk-checked
 * landing page or Lattice share token. Vercel Sandbox networkPolicy is egress
 * only. No environment variable may enable sharing until a trusted gateway
 * removes direct public origin access and enforces grants at request time.
 */
export const PREVIEW_INGRESS_CAPABILITY = 'public-sandbox-port' as const;

export function isPreviewSharingSafe(): boolean {
  return false; // fail closed; deliberately independent of all env flags.
}

export function isPreviewOriginPrivate(): boolean {
  return false;
}
