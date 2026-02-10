/**
 * Extend the TTL of a specific fact by 90 days
 * Used when user clicks "Keep this memory" to prevent deletion
 */
export declare function extendFactTTL(userId: string, factId: string, extendDays?: number): Promise<{
    success: boolean;
    newExpiresAt?: number;
    message: string;
}>;
/**
 * Delete a specific fact from user's memory
 */
export declare function deleteFact(userId: string, factId: string): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Soft delete a fact (mark as deleted instead of removing)
 * Useful for auditing and recovery
 */
export declare function softDeleteFact(userId: string, factId: string): Promise<{
    success: boolean;
    message: string;
}>;
//# sourceMappingURL=memoryRefresh.d.ts.map