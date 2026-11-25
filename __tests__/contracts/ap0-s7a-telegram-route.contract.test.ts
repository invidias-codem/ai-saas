jest.mock('@/lib/env',()=>({env:{TELEGRAM_WEBHOOK_SECRET:'synthetic-secret'}}));
jest.mock('next/server',()=>({NextResponse:{json:(body:unknown,init?:ResponseInit)=>({body,status:init?.status??200})}}));
import { POST } from '@/app/api/integrations/telegram/webhook/route';
test('unauthenticated webhook rejects before body parsing or provider work',async()=>{
  const json=jest.fn();
  const req={headers:new Headers(),json} as unknown as Request;
  expect((await POST(req)).status).toBe(401);
  expect(json).not.toHaveBeenCalled();
});
