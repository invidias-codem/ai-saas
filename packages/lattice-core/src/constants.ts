/**
 * Lattice OS platform constants.
 *
 * Import these instead of hard-coding magic numbers / strings.
 */

/** Default ports used by Lattice OS services. */
export const DEFAULT_PORTS = {
  app: 3000,
  postgres: 5432,
  redis: 6379,
} as const;

/** Minimum host resources required for a standard deployment. */
export const MINIMUM_RESOURCES = {
  ramGb: 4,
  cpus: 2,
  diskGb: 8,
} as const;

/** Minimum disk space warning / error thresholds. */
export const DISK_THRESHOLDS = {
  warnGb: 10,
  criticalGb: 4,
} as const;

/** Pre-flight check step count. Used to align progress indicators. */
export const PREFLIGHT_STEPS = 6;
