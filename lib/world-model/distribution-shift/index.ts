/**
 * Distribution Shift Detector — Public API
 * Tech Genie / World Model Layer
 *
 * Re-exports all types and the DistributionShiftDetector class.
 * Use `createDistributionShiftDetector` to obtain an instance.
 */

export * from './types'
export { DistributionShiftDetector } from './DistributionShiftDetector'

import type { SupabaseClient } from '@supabase/supabase-js'
import { DistributionShiftDetector } from './DistributionShiftDetector'

/**
 * Factory that constructs a DistributionShiftDetector bound to the given
 * Supabase client. Prefer this over `new DistributionShiftDetector()` so
 * callers don't need to import the class directly.
 *
 * @param supabase - Authenticated Supabase client with access to wm_* tables
 * @returns New DistributionShiftDetector instance
 */
export function createDistributionShiftDetector(supabase: SupabaseClient): DistributionShiftDetector {
  return new DistributionShiftDetector(supabase)
}
