/**
 * Session Cleanup Hook
 * 
 * Handles clearing session memory on logout or session expiration
 * Integrates with Clerk authentication events
 */

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { clearSessionMemoryStorage, getSessionInfo } from '@/lib/sessionClientMemory';

export function useSessionCleanup() {
  const { userId, isSignedIn } = useAuth();

  useEffect(() => {
    // If user logs out, we can optionally clear session memory
    // Set this to false to keep session memory even after logout
    const CLEAR_ON_LOGOUT = false; // User can log back in and resume

    if (isSignedIn === false) {
      if (CLEAR_ON_LOGOUT) {
        clearSessionMemoryStorage();
        console.log('[SessionCleanup] Session cleared on logout');
      } else {
        console.log('[SessionCleanup] Keeping session memory - user can resume when logged back in');
      }
    }
  }, [isSignedIn, userId]);

  return {
    manualClear: () => {
      clearSessionMemoryStorage();
      console.log('[SessionCleanup] Session manually cleared');
    },
    getStatus: () => {
      const info = getSessionInfo();
      return {
        active: info.isActive,
        messageCount: info.messageCount,
        ageMinutes: Math.floor((Date.now() - info.lastUpdated) / 60000),
      };
    },
  };
}
