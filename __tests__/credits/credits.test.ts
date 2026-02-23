
import { spendCreditsAtomic, deductCredits, checkCredits } from '@/lib/credits';
import { supabaseAdmin } from '@/lib/supabaseClient';

// Mock Supabase
jest.mock('@/lib/supabaseClient', () => ({
    supabaseAdmin: {
        rpc: jest.fn(),
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
    },
}));

describe('Credits System', () => {
    const mockUserId = 'user_123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('spendCreditsAtomic', () => {
        it('should return success when RPC succeeds', async () => {
            (supabaseAdmin!.rpc as jest.Mock).mockResolvedValue({
                data: { success: true, duplicate: false, remaining: 90 },
                error: null
            });

            const result = await spendCreditsAtomic(mockUserId, 10, 'key_1', 'Test spend');

            expect(result.success).toBe(true);
            expect(result.remaining).toBe(90);
            expect(supabaseAdmin!.rpc).toHaveBeenCalledWith('spend_credits', {
                p_user_id: mockUserId,
                p_amount: 10,
                p_idempotency_key: 'key_1',
                p_description: 'Test spend',
                p_metadata: {}
            });
        });

        it('should handle duplicate requests idempotentely', async () => {
            (supabaseAdmin!.rpc as jest.Mock).mockResolvedValue({
                data: { success: true, duplicate: true, remaining: 90 }, // Balance unchanged
                error: null
            });

            const result = await spendCreditsAtomic(mockUserId, 10, 'key_1', 'Test spend');

            expect(result.success).toBe(true);
            expect(result.duplicate).toBe(true);
        });

        it('should return error on insufficient funds', async () => {
            (supabaseAdmin!.rpc as jest.Mock).mockResolvedValue({
                data: { success: false, duplicate: false, remaining: 5, error: 'Insufficient funds' },
                error: null
            });

            const result = await spendCreditsAtomic(mockUserId, 10, 'key_2', 'Test spend');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Insufficient funds');
        });

        it('should handle RPC errors gracefully', async () => {
            (supabaseAdmin!.rpc as jest.Mock).mockResolvedValue({
                data: null,
                error: { message: 'Database error' }
            });

            const result = await spendCreditsAtomic(mockUserId, 10, 'key_3', 'Test spend');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Database error');
        });
    });
});
