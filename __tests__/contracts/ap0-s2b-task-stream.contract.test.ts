jest.mock('@/lib/api/partnerAuth', () => ({authenticatePartner: jest.fn()}));
jest.mock('@/lib/supabaseClient', () => ({supabaseAdmin:{from:jest.fn()}}));
jest.mock('next/server', () => ({NextResponse:{json:(body:unknown,init?:ResponseInit)=>new Response(JSON.stringify(body),init)}}));
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { GET } from '@/app/api/v1/tasks/[taskId]/stream/route';
import type { NextRequest } from 'next/server';

const from = supabaseAdmin!.from as jest.Mock;
const auth = authenticatePartner as jest.Mock;
const params = {params:Promise.resolve({taskId:'synthetic-task'})};
const req = () => new Request('https://lattice.test/api/v1/tasks/synthetic-task/stream') as NextRequest;
function query(data:unknown,error:unknown=null) {
  const result={data,error};
  const q:any={select:jest.fn(),eq:jest.fn(),order:jest.fn(),limit:jest.fn(),maybeSingle:jest.fn().mockResolvedValue(result)};
  for(const k of ['select','eq','order','limit'])q[k].mockReturnValue(q);
  q.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve);
  return q;
}
beforeEach(()=>{jest.resetAllMocks();auth.mockResolvedValue({ok:true,context:{workspaceId:'workspace-a'}});});
test('invalid key does not access task or audit',async()=>{
  auth.mockResolvedValue({ok:false,response:new Response(null,{status:401})});
  expect((await GET(req(),params)).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});
test('foreign or absent task returns uniform denial before audit query or SSE',async()=>{
  const q=query(null);from.mockReturnValue(q);
  const res=await GET(req(),params);
  expect(res.status).toBe(404);
  expect(q.eq).toHaveBeenCalledWith('workspace_id','workspace-a');
  expect(q.eq).toHaveBeenCalledWith('id','synthetic-task');
  expect(from).not.toHaveBeenCalledWith('audit_log');
  expect(await res.text()).not.toContain('stream_started');
});
test('database error cannot leak or open a stream',async()=>{
  from.mockReturnValue(query(null,{message:'private details'}));
  const res=await GET(req(),params);
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain('private details');
  expect(from).not.toHaveBeenCalledWith('audit_log');
});
test('authorized snapshot uses both workspace principal and task association for audit',async()=>{
  const task=query({id:'synthetic-task',status:'completed',result:'synthetic-result'});
  const audit=query([{id:'audit-1',event_type:'task.completed'}]);
  from.mockReturnValueOnce(task).mockReturnValueOnce(audit);
  const res=await GET(req(),params);
  expect(res.status).toBe(200);
  expect(auth).toHaveBeenCalledWith(expect.anything(),'stream:read');
  expect(task.eq).toHaveBeenCalledWith('workspace_id','workspace-a');
  expect(audit.eq).toHaveBeenCalledWith('user_id','partner_ws_workspace-a');
  expect(audit.eq).toHaveBeenCalledWith('metadata->>taskId','synthetic-task');
  expect(audit.eq).toHaveBeenCalledWith('trace_id','task-synthetic-task');
  expect(audit.limit).toHaveBeenCalledWith(200);
  expect(await res.text()).toContain('synthetic-result');
});
test('audit failure does not expose partial result',async()=>{
  from.mockReturnValueOnce(query({id:'synthetic-task',result:'private-result'})).mockReturnValueOnce(query(null,{message:'audit error'}));
  const res=await GET(req(),params);expect(res.status).toBe(503);expect(await res.text()).not.toContain('private-result');
});
