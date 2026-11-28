jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
import { supabaseAdmin } from '@/lib/supabaseClient';
import { approveDurable, rejectDurable, getDurableApproval, dropDurableApproval } from '@/lib/execution/durableApprovalStore';
const from = supabaseAdmin!.from as jest.Mock;
function builder(data: unknown = null, error: unknown = null) {
  const q: any = { update: jest.fn(), eq: jest.fn(), gt: jest.fn(), select: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({data,error}) };
  for (const k of ['update','eq','gt','select']) q[k].mockReturnValue(q);
  from.mockReturnValue(q); return q;
}
beforeEach(() => jest.resetAllMocks());
test('approval transition atomically filters authenticated owner, pending state and expiry', async () => {
  const q = builder(); expect(await approveDurable('approval','caller')).toBeNull();
  expect(q.eq).toHaveBeenCalledWith('approval_id','approval');
  expect(q.eq).toHaveBeenCalledWith('user_id','caller');
  expect(q.eq).toHaveBeenCalledWith('status','PENDING');
  expect(q.gt).toHaveBeenCalledWith('expires_at',expect.any(String));
  expect(q.update).toHaveBeenCalledWith({status:'APPROVED'});
});
test('rejection and drop use same scoped predicates and report no matched row', async () => {
  const q = builder(); expect(await rejectDurable('approval','caller')).toBe(false);
  expect(await dropDurableApproval('approval','caller')).toBe(false);
  expect(q.eq).toHaveBeenCalledWith('user_id','caller');
  expect(q.eq).toHaveBeenCalledWith('status','PENDING');
  expect(q.gt).toHaveBeenCalledWith('expires_at',expect.any(String));
});
test('lookup cannot return unscoped or expired rows', async () => {
  const q = builder(); expect(await getDurableApproval('approval','caller')).toBeNull();
  expect(q.eq).toHaveBeenCalledWith('user_id','caller');
  expect(q.gt).toHaveBeenCalledWith('expires_at',expect.any(String));
});
test('missing principal does not access database', async () => {
  expect(await approveDurable('approval','')).toBeNull();
  expect(await rejectDurable('approval','')).toBe(false);
  expect(await getDurableApproval('approval','')).toBeNull();
  expect(from).not.toHaveBeenCalled();
});
test('database errors do not become successful claims', async () => {
  builder(null,{message:'unavailable'});
  await expect(approveDurable('approval','caller')).rejects.toThrow('Approval transition unavailable');
});
