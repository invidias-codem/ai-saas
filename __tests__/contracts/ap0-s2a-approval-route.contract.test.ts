jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue({userId:'caller'}),
  AuthenticationError: class extends Error {},
  AuthorizationError: class extends Error {},
  handleAuthError: jest.fn(), getClientIP: jest.fn(),
}));
jest.mock('@/lib/security/rateLimit', () => ({limitApiEndpoint: jest.fn()}));
jest.mock('@/lib/security/workspaceAccess', () => ({getWorkspaceAccess: jest.fn()}));
jest.mock('@/lib/execution/durableApprovalStore', () => ({approveDurable: jest.fn(), rejectDurable: jest.fn(), getDurableApproval: jest.fn()}));
jest.mock('@/lib/agents/core/agenticToolSet', () => ({resolveAgenticTool: jest.fn()}));
jest.mock('@/lib/media/envelope', () => ({hasMediaEnvelope: jest.fn().mockReturnValue(false)}));
jest.mock('next/server', () => ({NextResponse: {json: (body: unknown, init?: ResponseInit) => ({body,status:init?.status ?? 200})}}));
import { POST } from '@/app/api/approval/resume/route';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getWorkspaceAccess } from '@/lib/security/workspaceAccess';
import { approveDurable, rejectDurable, getDurableApproval } from '@/lib/execution/durableApprovalStore';
import { resolveAgenticTool } from '@/lib/agents/core/agenticToolSet';
const get = getDurableApproval as jest.Mock, approve = approveDurable as jest.Mock, reject = rejectDurable as jest.Mock;
const access = getWorkspaceAccess as jest.Mock, tool = resolveAgenticTool as jest.Mock;
const execute = jest.fn();
const record = () => ({approvalId:'a',userId:'caller',workspaceId:'ws',toolName:'synthetic',input:{},context:{userId:'caller',workspaceId:'ws',sessionId:'s',history:[],enableTelemetry:false},status:'PENDING',expiresAt:new Date(Date.now()+60000).toISOString()});
const req = (body: unknown) => new Request('https://lattice.test/api/approval/resume',{method:'POST',body:JSON.stringify(body)});
beforeEach(() => {
  jest.clearAllMocks();
  (limitApiEndpoint as jest.Mock).mockResolvedValue({success:true});
  get.mockResolvedValue(record()); access.mockResolvedValue({role:'owner'});
  approve.mockResolvedValue({...record(),status:'APPROVED'}); reject.mockResolvedValue(true);
  tool.mockReturnValue({schema:{safeParse:()=>({success:true,data:{}})},execute});
});
test('missing explicit decision cannot claim', async()=>{expect((await POST(req({approvalId:'a'}))).status).toBe(400);expect(approve).not.toHaveBeenCalled();});
test.each([true,false])('foreign approval denied before mutation (%s)',async approved=>{get.mockResolvedValue(null);expect((await POST(req({approvalId:'a',approved}))).status).toBe(404);expect(get).toHaveBeenCalledWith('a','caller');expect(approve).not.toHaveBeenCalled();expect(reject).not.toHaveBeenCalled();});
test('revoked scope denied before claim',async()=>{access.mockResolvedValue(null);expect((await POST(req({approvalId:'a',approved:true}))).status).toBe(404);expect(approve).not.toHaveBeenCalled();});
test('expired approval denied',async()=>{get.mockResolvedValue({...record(),expiresAt:'2000-01-01'});expect((await POST(req({approvalId:'a',approved:true}))).status).toBe(404);expect(approve).not.toHaveBeenCalled();});
test('sandbox tool cannot execute directly',async()=>{tool.mockReturnValue({requiresSandbox:true});expect((await POST(req({approvalId:'a',approved:true}))).status).toBe(403);expect(approve).not.toHaveBeenCalled();});
test('lost claim cannot execute',async()=>{approve.mockResolvedValue(null);expect((await POST(req({approvalId:'a',approved:true}))).status).toBe(409);expect(execute).not.toHaveBeenCalled();});
test('revocation after claim denies execution',async()=>{access.mockResolvedValueOnce({role:'owner'}).mockResolvedValueOnce(null);expect((await POST(req({approvalId:'a',approved:true}))).status).toBe(409);expect(execute).not.toHaveBeenCalled();});
test('owner denial consumes only own request',async()=>{expect((await POST(req({approvalId:'a',approved:false}))).status).toBe(200);expect(reject).toHaveBeenCalledWith('a','caller');expect(execute).not.toHaveBeenCalled();});
test('valid owner claim executes once',async()=>{execute.mockResolvedValue({ok:true});expect((await POST(req({approvalId:'a',approved:true}))).status).toBe(200);expect(approve).toHaveBeenCalledWith('a','caller');expect(execute).toHaveBeenCalledTimes(1);});
