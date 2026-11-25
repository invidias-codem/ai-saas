import { verifyTelegramWebhookSecret, isTelegramPrivateAdmin } from '@/lib/security/telegramWebhookAuth';
test.each([undefined,'','invalid space'])('missing or invalid config fails closed (%s)', expected => {
  expect(verifyTelegramWebhookSecret(expected,'valid')).toEqual({ok:false,status:503});
});
test.each([null,'','wrong','invalid space'])('missing or incorrect provider token rejected (%s)', supplied => {
  expect(verifyTelegramWebhookSecret('valid',supplied)).toEqual({ok:false,status:401});
});
test('matching provider token accepted',()=>expect(verifyTelegramWebhookSecret('valid','valid')).toEqual({ok:true}));
const chat = {id:123,type:'private'}, sender = {id:123,is_bot:false};
test('only configured private sender is administrator',()=>{
  expect(isTelegramPrivateAdmin('123',chat,sender)).toBe(true);
  expect(isTelegramPrivateAdmin('123',{...chat,type:'group'},sender)).toBe(false);
  expect(isTelegramPrivateAdmin('123',chat,{...sender,id:456})).toBe(false);
  expect(isTelegramPrivateAdmin('123',chat,{...sender,is_bot:true})).toBe(false);
  expect(isTelegramPrivateAdmin(undefined,chat,sender)).toBe(false);
});
