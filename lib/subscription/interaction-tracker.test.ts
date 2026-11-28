jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { rpc: jest.fn() } }));
const mockResult = jest.fn();
import { supabaseAdmin } from '@/lib/supabaseClient';
import { trackFreeInteraction } from './interaction-tracker';

describe('optional interaction tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabaseAdmin!.rpc as jest.Mock).mockReturnValue({ abortSignal: mockResult });
  });
  test('nudges at the threshold', async () => {
    mockResult.mockResolvedValue({ data: 20, error: null });
    expect(await trackFreeInteraction('user_test')).toEqual({ count: 20, shouldNudge: true });
  });
  test('missing schema is diagnosed without breaking chat', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockResult.mockResolvedValue({ data: null, error: { code: '42P01' } });
    expect(await trackFreeInteraction('user_test')).toEqual({ count: 0, shouldNudge: false });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('schema unavailable'), expect.objectContaining({ code: '42P01' }));
    warning.mockRestore();
  });
  test('a rejected database request does not break chat', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockResult.mockRejectedValue(new Error('network unavailable'));
    expect(await trackFreeInteraction('user_test')).toEqual({ count: 0, shouldNudge: false });
    warning.mockRestore();
  });
});
