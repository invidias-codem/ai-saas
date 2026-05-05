import { BlueskyResponder } from '../BlueskyResponder';
import { BlueskySafetyPolicy } from '../BlueskySafetyPolicy';
import { BlueskyDiscoveryEngine, findRejectReason } from '../BlueskyDiscoveryEngine';

describe('Bluesky Proactive Marketing & Discovery', () => {
  let responder: any;
  let discovery: any;

  beforeAll(() => {
    // Mock env vars required by constructors
    process.env.BLUESKY_HANDLE = 'test.bsky.social';
    process.env.BLUESKY_APP_PASSWORD = 'test_password';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_key';
    
    responder = new BlueskyResponder();
    discovery = new BlueskyDiscoveryEngine();
  });

  describe('Discovery Reject Filters', () => {
    it('rejects emotionally charged and sensitive posts', () => {
      expect(findRejectReason('I am so furious and angry about this outrage! This is a scam and disgusting.', 5)).toBe('off_topic_or_sensitive');
      expect(findRejectReason('Let us discuss the upcoming election and politics.', 5)).toBe('off_topic_or_sensitive');
      expect(findRejectReason('Just built an awesome Next.js and Supabase app. Anyone else building agents?', 5)).toBeNull(); // Should not reject
    });

    it('decides to reply to exceptionally high-scoring posts', () => {
      const decide = (score: number) => discovery.decide({ score, uri: 'at://', cid: '123', text: 'test', authorHandle: 'test', authorDid: 'did', reason: 'test' });
      
      expect(decide(15).action).toBe('reply');
      expect(decide(12).action).toBe('reply');
      expect(decide(10).action).toBe('like');
      expect(decide(5).action).toBe('skip');
    });
  });

  describe('Responder Engagement Upgrades', () => {
    it('upgrades praise on own posts to a short reply instead of just a like', () => {
      const params = {
        mention: { text: 'Great point!' },
        actorMemory: null,
        conversationMemory: null,
        threadContext: { replyToOwnPost: true },
        replyIntent: 'praise',
        source: 'mention'
      };

      const decision = responder['decideEngagement'](params);
      expect(decision.action).toBe('reply_short');
      expect(decision.reason).toBe('proactive_marketing_acknowledgement');
    });

    it('keeps low_value acknowledgements as like_only to avoid spam', () => {
      const params = {
        mention: { text: 'nice' },
        actorMemory: null,
        conversationMemory: null,
        threadContext: { replyToOwnPost: true },
        replyIntent: 'low_value',
        source: 'mention'
      };

      const decision = responder['decideEngagement'](params);
      expect(decision.action).toBe('like_only');
    });
  });

});
