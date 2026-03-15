// components/ReferralCapture.tsx
// Drop this into your root layout or sign-up success page.
// It fires once after Clerk auth is established and captures the referral cookie.

'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';

export function ReferralCapture() {
  const { isLoaded, isSignedIn, user } = useUser();
  const hasFired = useRef(false);

  useEffect(() => {
    // Only run once per session, only when user is freshly signed in
    if (!isLoaded || !isSignedIn || hasFired.current) return;

    // Check if referral cookie exists before making the call
    const hasCookie = document.cookie.split(';').some(c => c.trim().startsWith('tg_ref='));
    if (!hasCookie) return;

    hasFired.current = true;

    // Fire and forget — don't block the UI
    fetch('/api/referral/capture', {
      method: 'POST',
      credentials: 'include', // sends cookies
    }).then(res => res.json()).then(data => {
      if (data.captured) {
        console.log(`[ReferralCapture] Attributed to: ${data.code}`);
      }
    }).catch(err => {
      console.warn('[ReferralCapture] Failed:', err);
    });
  }, [isLoaded, isSignedIn, user?.id]);

  // Renders nothing — purely side-effect
  return null;
}

// Usage: add to app/[locale]/layout.tsx or app/layout.tsx
//
// import { ReferralCapture } from '@/components/ReferralCapture';
//
// export default function RootLayout({ children }) {
//   return (
//     <html>
//       <body>
//         <ReferralCapture />
//         {children}
//       </body>
//     </html>
//   );
// }
