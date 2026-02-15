/**
 * status of job
 */
export const STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
} as const;


export const JOB_RESULT_STATUS = {
    SUCCESS: 'success',
    FAILED: 'failed',
} as const;

export type JobResultStatus = (typeof JOB_RESULT_STATUS)[keyof typeof JOB_RESULT_STATUS];