import { BlueskyResponder } from '../BlueskyResponder';
import { BlueskySafetyPolicy } from '../BlueskySafetyPolicy';
import {
  BlueskyDiscoveryEngine,
  evaluateSmallBusinessSlackFit,
  findRejectReason,
} from '../BlueskyDiscoveryEngine';

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
    it('identifies small-business Slack AI pain without weakening off-topic filters', () => {
      const qualified = evaluateSmallBusinessSlackFit(
        'Our 12-person agency runs on Slack. Has anyone found AI that can summarize client handoffs and stop context getting lost?'
      );

      expect(qualified.isTarget).toBe(true);
      expect(qualified.hasPainSignal).toBe(true);
      expect(qualified.scoreBoost).toBeGreaterThanOrEqual(4);
      expect(qualified.reasons).toEqual(expect.arrayContaining(['target:small_business_slack', 'pain_signal']));

      const generic = evaluateSmallBusinessSlackFit('Slack is down again lol');
      expect(generic.isTarget).toBe(false);
      expect(generic.hasPainSignal).toBe(false);
      expect(generic.scoreBoost).toBe(0);

      expect(findRejectReason('Slack airdrop giveaway for small businesses using AI', 4)).toBe('low_signal_pattern');
    });

    it('rejects emotionally charged and sensitive posts', () => {
      expect(findRejectReason('I am so furious and angry about this outrage! This is a scam and disgusting.', 5)).toBe('off_topic_or_sensitive');
      expect(findRejectReason('Let us discuss the upcoming election and politics.', 5)).toBe('off_topic_or_sensitive');
      expect(findRejectReason('Just built an awesome Next.js and Supabase app. Anyone else building agents?', 5)).toBeNull(); // Should not reject
    });

    it('keeps small-business Slack discovery as like-only without an explicit pain signal', () => {
      const decision = discovery.decide({
        score: 14,
        uri: 'at://small-business-slack-post',
        cid: '123',
        text: 'test',
        authorHandle: 'agency.example',
        authorDid: 'did:example:agency',
        reason: 'lane:tech|target:small_business_slack|quality_score:5',
      });

      expect(decision.action).toBe('like');
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
