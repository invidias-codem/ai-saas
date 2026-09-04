import {
  decideForceNew,
  resolveWorkspaceForNewConversation,
  conversationAccessFilter,
} from '@/lib/conversations/routing';

describe('conversation routing invariants', () => {
  describe('blank-slate (Slice 5 / E3)', () => {
    it('forces a new conversation when ?action=new', () => {
      expect(decideForceNew({ action: 'new' })).toBe(true);
    });
    it('respects last-open when action is absent', () => {
      expect(decideForceNew({})).toBe(false);
      expect(decideForceNew(undefined)).toBe(false);
      expect(decideForceNew(null)).toBe(false);
    });
    it('ignores unrelated action values', () => {
      expect(decideForceNew({ action: 'resume' })).toBe(false);
    });
  });

  describe('workspace stamping (C1 orphan fix)', () => {
    const owned = { id: 'w-owned', default_operating_profile_id: 'p1' };
    const dflt = { id: 'w-default', default_operating_profile_id: 'p2' };

    it('uses the explicitly requested workspace when owned', () => {
      const w = resolveWorkspaceForNewConversation({
        requestedWorkspaceId: 'w-owned',
        requestedWorkspaceOwned: owned,
        defaultWorkspace: dflt,
      });
      expect(w?.id).toBe('w-owned');
    });

    it('falls back to default when requested workspace is not owned', () => {
      const w = resolveWorkspaceForNewConversation({
        requestedWorkspaceId: 'w-foreign',
        requestedWorkspaceOwned: null,
        defaultWorkspace: dflt,
      });
      expect(w?.id).toBe('w-default');
    });

    it('returns null when nothing is available (caller redirects to onboarding)', () => {
      expect(resolveWorkspaceForNewConversation({})).toBeNull();
    });

    it('never returns a null-id workspace (orphan guard)', () => {
      for (const w of [
        resolveWorkspaceForNewConversation({ requestedWorkspaceId: 'x', requestedWorkspaceOwned: owned }),
        resolveWorkspaceForNewConversation({ defaultWorkspace: dflt }),
      ]) {
        expect(w?.id).toBeTruthy();
        expect(w && 'default_operating_profile_id' in w).toBe(true);
      }
    });
  });

  describe('IDOR wall (Slice 2 / H2)', () => {
    it('scopes by both id and user_id', () => {
      const f = conversationAccessFilter('conv-1', 'user-a');
      expect(f).toEqual({ id: 'conv-1', user_id: 'user-a' });
    });

    it('refuses to build a query without an authenticated user', () => {
      expect(conversationAccessFilter('conv-1', null)).toBeNull();
    });

    it('two users get different filters for the same conversation', () => {
      const a = conversationAccessFilter('conv-1', 'user-a');
      const b = conversationAccessFilter('conv-1', 'user-b');
      expect(a?.user_id).not.toBe(b?.user_id);
    });
  });
});
