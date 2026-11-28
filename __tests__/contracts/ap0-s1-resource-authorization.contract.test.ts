/** S1 route-level regressions; no real Clerk, Supabase or network access. */
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }));
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/security/rateLimit', () => ({ limitApiEndpoint: jest.fn() }));
jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn(),
  canWorkspaceRole: jest.fn((role: string, permission: string) => Boolean(role) && permission === 'workspace:read'),
}));
jest.mock('next/server', () => ({
  NextResponse: class {
    constructor(public body: unknown, public init?: ResponseInit) {}
    get status() { return this.init?.status ?? 200; }
    static json(body: unknown, init?: ResponseInit) { return new this(body, init); }
  },
}));

import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { getWorkspaceAccess } from '@/lib/security/workspaceAccess';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { GET as getWorkspace } from '@/app/api/workspaces/[workspaceId]/route';
import { GET as getGrants, POST as postGrant } from '@/app/api/workspaces/[workspaceId]/harness/grants/route';
import { POST as createConversation } from '@/app/api/conversations/new/route';
import type { NextRequest } from 'next/server';

const ws = '00000000-0000-4000-8000-000000000001';
const profile = '00000000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ workspaceId: ws }) };
const from = supabaseAdmin!.from as jest.Mock;
const mockAuth = auth as unknown as jest.Mock;
const access = getWorkspaceAccess as jest.Mock;
const rate = limitApiEndpoint as jest.Mock;
function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const q: any = { select: jest.fn(), eq: jest.fn(), insert: jest.fn(), maybeSingle: jest.fn().mockResolvedValue(result), single: jest.fn().mockResolvedValue(result) };
  for (const k of ['select', 'eq', 'insert']) q[k].mockReturnValue(q);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}
function getReq(suffix = '') { return new Request('https://lattice.test/api/workspaces/' + ws + suffix) as NextRequest; }
function postReq(body: unknown) { return new Request('https://lattice.test/api/test', { method: 'POST', body: JSON.stringify(body) }); }
beforeEach(() => {
  jest.resetAllMocks();
  mockAuth.mockResolvedValue({ userId: 'caller' });
  rate.mockResolvedValue({ success: true });
  (require('@/lib/security/workspaceAccess').canWorkspaceRole as jest.Mock).mockImplementation((role: string, permission: string) => Boolean(role) && permission === 'workspace:read');
  access.mockResolvedValue(null);
});
test('workspace GET denies anonymous before lookup', async () => {
  mockAuth.mockResolvedValue({ userId: null });
  expect((await getWorkspace(getReq(), params)).status).toBe(401);
  expect(from).not.toHaveBeenCalled(); expect(access).not.toHaveBeenCalled();
});
test('workspace GET rejects foreign or revoked membership without data lookup', async () => {
  expect((await getWorkspace(getReq(), params)).status).toBe(404);
  expect(access).toHaveBeenCalledWith('caller', ws); expect(from).not.toHaveBeenCalled();
});
test('workspace GET rejects query override', async () => {
  expect((await getWorkspace(getReq('?workspaceId=foreign'), params)).status).toBe(404);
  expect(access).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
});
test('workspace GET allows accepted viewer via shared access contract', async () => {
  access.mockResolvedValue({ role: 'viewer' }); const q = query({ id: ws }); from.mockReturnValue(q);
  expect((await getWorkspace(getReq(), params)).status).toBe(200);
  expect(q.eq).toHaveBeenCalledWith('id', ws);
});
test('workspace GET fails closed when authorization store fails', async () => {
  access.mockRejectedValue(new Error('unavailable'));
  expect((await getWorkspace(getReq(), params)).status).toBe(503); expect(from).not.toHaveBeenCalled();
});
test('grant POST denies foreign workspace without inserting', async () => {
  const q = query(null); from.mockReturnValue(q);
  expect((await postGrant(postReq({ path: '/synthetic', label: 'test' }), params)).status).toBe(404);
  expect(q.eq).toHaveBeenCalledWith('user_id', 'caller'); expect(from).not.toHaveBeenCalledWith('harness_root_grants');
});
test('grant GET denies foreign workspace without listing', async () => {
  from.mockReturnValue(query(null));
  expect((await getGrants(getReq(), params)).status).toBe(404);
  expect(from).not.toHaveBeenCalledWith('harness_root_grants');
});
test('grant POST rejects contradictory destructive read-only grant', async () => {
  from.mockReturnValue(query({ id: ws }));
  expect((await postGrant(postReq({ path: '/synthetic', label: 'test', read_only: true, allow_destructive: true }), params)).status).toBe(400);
  expect(from).not.toHaveBeenCalledWith('harness_root_grants');
});
test('grant POST uses verified scope and safe defaults', async () => {
  const q = query({ id: 'grant' }); from.mockReturnValueOnce(query({ id: ws })).mockReturnValueOnce(q);
  expect((await postGrant(postReq({ path: '/synthetic', label: 'test', user_id: 'foreign' }), params)).status).toBe(200);
  expect(q.insert).toHaveBeenCalledWith({ workspace_id: ws, user_id: 'caller', path: '/synthetic', label: 'test', read_only: true, allow_destructive: false });
});
test('conversation rejects foreign workspace before insert', async () => {
  const q = query(null); from.mockReturnValue(q);
  expect((await createConversation(postReq({ workspaceId: ws }))).status).toBe(404);
  expect(q.eq).toHaveBeenCalledWith('user_id', 'caller'); expect(from).not.toHaveBeenCalledWith('conversations');
});
test('conversation rejects foreign operating profile before insert', async () => {
  from.mockReturnValueOnce(query({ id: ws })).mockReturnValueOnce(query(null));
  expect((await createConversation(postReq({ workspaceId: ws, operatingProfileId: profile }))).status).toBe(404);
  expect(from).not.toHaveBeenCalledWith('conversations');
});
test('conversation accepts owned associations and stamps trusted user', async () => {
  const q = query({ id: 'conversation', title: 'New Conversation', created_at: '2026-01-01' });
  from.mockReturnValueOnce(query({ id: ws })).mockReturnValueOnce(query({ id: profile })).mockReturnValueOnce(q);
  expect((await createConversation(postReq({ workspaceId: ws, operatingProfileId: profile }))).status).toBe(200);
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'caller', workspace_id: ws, operating_profile_id: profile }));
});
test('conversation preserves legacy absent scope without client identity override', async () => {
  const q = query({ id: 'conversation', title: 'New Conversation', created_at: '2026-01-01' }); from.mockReturnValue(q);
  expect((await createConversation(postReq({ userId: 'foreign' }))).status).toBe(200);
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'caller', workspace_id: null, operating_profile_id: null }));
});
