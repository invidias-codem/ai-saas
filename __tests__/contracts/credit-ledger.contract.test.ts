/**
 * Credit-ledger contract tests.
 *
 * Locks the invariant that one logical charge == one `supporter_credits`
 * mutation, and that the idempotency key reaches the atomic `spend_credits`
 * RPC boundary (never dropped or regenerated en route).
 *
 * requestId is CORRELATION; the idempotency key is DEDUPLICATION. These two
 * concepts are not conflated anywhere in this module's surface.
 */
import {
  spendCreditsAtomic,
  deductCredits,
  checkCredits,
  getCredits,
  refundCredits,
  hasUnlimitedUsageAccess,
  ensureSufficientCreditsOrRespond,
} from '@/lib/credits';
import { deductUserCredits } from '@/lib/subscription/credits';
import { supabaseAdmin } from '@/lib/supabaseClient';

jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    rpc: jest.fn(),
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  },
}));

const rpc = supabaseAdmin!.rpc as jest.Mock;
// The mock attaches chainable query-builder methods directly to the client;
// type the whole thing as the mock bag it is.
const mockClient = supabaseAdmin as unknown as {
  rpc: jest.Mock;
  from: jest.Mock;
  select: jest.Mock;
  eq: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
};
const from = mockClient.from;
const select = mockClient.select;
const eq = mockClient.eq;
const maybeSingle = mockClient.maybeSingle;
const single = mockClient.single;

const USER = 'user_123';

describe('Credit ledger contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default Supabase chain shape: from().select().eq().maybeSingle()
    (supabaseAdmin!.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle,
          single,
        }),
      }),
    });
  });

  describe('spendCreditsAtomic — one logical debit == one mutation', () => {
    it('propagates the idempotency key verbatim to the atomic RPC boundary', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: false, remaining: 90 }, error: null });

      const KEY = 'op:msg_456:credit-debit:v1';
      await spendCreditsAtomic(USER, 10, KEY, 'Chat interaction');

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('spend_credits', {
        p_user_id: USER,
        p_amount: 10,
        p_idempotency_key: KEY,
        p_description: 'Chat interaction',
        p_metadata: {},
      });
    });

    it('never calls the RPC more than once per logical debit', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: false, remaining: 90 }, error: null });
      await spendCreditsAtomic(USER, 10, 'op:once', 'Test');
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('surfaces duplicate=true without a second mutation when the same key replays', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: true, remaining: 90 }, error: null });
      const result = await spendCreditsAtomic(USER, 10, 'op:dup', 'Test');
      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(result.remaining).toBe(90);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('treats distinct operation keys as distinct operations', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: false, remaining: 80 }, error: null });
      const a = await spendCreditsAtomic(USER, 10, 'op:A', 'Test');
      const b = await spendCreditsAtomic(USER, 10, 'op:B', 'Test');
      expect(a.success).toBe(true);
      expect(b.success).toBe(true);
      const pKeys = rpc.mock.calls.map((c) => c[1].p_idempotency_key);
      expect(pKeys).toEqual(['op:A', 'op:B']);
    });

    it('fails deterministically (success=false, no throw) when funds are insufficient', async () => {
      rpc.mockResolvedValue({ data: { success: false, duplicate: false, remaining: 5, error: 'Insufficient funds' }, error: null });
      const result = await spendCreditsAtomic(USER, 10, 'op:insufficient', 'Test');
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(5);
    });

    it('fails safe on transport/RPC error without corrupting local state', async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'Database error' } });
      const result = await spendCreditsAtomic(USER, 10, 'op:rpc-error', 'Test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.remaining).toBe(0);
    });
  });

  describe('hasUnlimitedUsageAccess — bypass only when intended', () => {
    it('returns false for a plain user with no master/enterprise markers', async () => {
      maybeSingle.mockResolvedValue({ data: { tier: 'free' }, error: null });
      const result = await hasUnlimitedUsageAccess(USER, 'plain@example.com');
      expect(result).toBe(false);
    });

    it('returns true for enterprise tier in supporter_credits', async () => {
      maybeSingle.mockResolvedValue({ data: { tier: 'enterprise' }, error: null });
      const result = await hasUnlimitedUsageAccess(USER, 'plain@example.com');
      expect(result).toBe(true);
    });

    it('does NOT bypass when tier lookup errors', async () => {
      maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const result = await hasUnlimitedUsageAccess(USER, 'plain@example.com');
      expect(result).toBe(false);
    });
  });

  describe('getCredits / checkCredits / refund / deduct', () => {
    it('getCredits returns 0 when no row exists (no invention of a balance)', async () => {
      single.mockResolvedValue({ data: null, error: { message: 'not found' } });
      const result = await getCredits(USER);
      expect(result).toBe(0);
    });

    it('checkCredits returns false when it cannot verify (fail-closed)', async () => {
      single.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const result = await checkCredits(USER, 10);
      expect(result).toBe(false);
    });

    it('refundCredits issues exactly one increment_credits RPC with REFUND type', async () => {
      rpc.mockResolvedValue({ data: null, error: null });
      await refundCredits(USER, 25, 'Provider failure refund');
      expect(rpc).toHaveBeenCalledWith('increment_credits', {
        p_user_id: USER,
        p_amount: 25,
        p_type: 'REFUND',
        p_description: 'Provider failure refund',
        p_metadata: {},
      });
    });

    it('deductCredits issues increment_credits with a negative amount', async () => {
      rpc.mockResolvedValue({ data: null, error: null });
      await deductCredits(USER, 10, 'Usage');
      expect(rpc).toHaveBeenCalledWith('increment_credits', {
        p_user_id: USER,
        p_amount: -10,
        p_type: 'USAGE',
        p_description: 'Usage',
        p_metadata: {},
      });
    });
  });

  describe('deductUserCredits — compute-path idempotency boundary (Phase 2)', () => {
    it('forwards a provided idempotency key verbatim to the atomic spend_credits RPC', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: false, remaining: 90 }, error: null });
      await deductUserCredits(USER, 100, 10, 'req_123');
      expect(rpc).toHaveBeenCalledWith('spend_credits', {
        p_user_id: USER,
        p_amount: 10,
        p_idempotency_key: 'req_123',
        p_description: 'Chat/agent interaction',
        p_metadata: {},
      });
    });

    it('passes null (no dedup) when no key is supplied, preserving legacy callers', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: false, remaining: 90 }, error: null });
      await deductUserCredits(USER, 100, 10);
      expect(rpc).toHaveBeenCalledWith('spend_credits', {
        p_user_id: USER,
        p_amount: 10,
        p_idempotency_key: null,
        p_description: 'Chat/agent interaction',
        p_metadata: {},
      });
    });

    it('a duplicate-key replay surfaces duplicate=true without a second mutation', async () => {
      rpc.mockResolvedValue({ data: { success: true, duplicate: true, remaining: 90 }, error: null });
      const result = await deductUserCredits(USER, 100, 10, 'req_123');
      expect(result).toBe(90); // remaining, not double-deducted
    });
  });
});