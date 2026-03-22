# Vercel Web Analytics Implementation Spec

## Objective
Enable comprehensive event tracking within the Tech Genie application using Vercel Web Analytics (`@vercel/analytics`). This will populate the Vercel dashboard with actionable metrics regarding AI tool usage, conversion funnels, and user interactions.

## Prerequisites
- `@vercel/analytics` is already installed and mounted globally via `app/[locale]/layout.tsx`.
- Basic Page Views and Unique Visitors are already functioning.

## 1. Server-Side Tracking (Backend AI Generation)
Server-side tracking ensures 100% accuracy for successful actions (bypassing client-side ad-blockers and failed form validations).

**Target Files:**
- `app/api/conversation/route.ts`
- `app/api/image/route.ts`
- `app/api/video/route.ts`
- `app/api/music/route.ts`
- `app/api/code/route.ts`

**Implementation:**
Import the server-side tracking module at the top of each API route:
```typescript
import { track } from '@vercel/analytics/server';
```

Inject the `track` call immediately following a successful generation (before the response is returned to the client), capturing relevant metadata:

**Conversation Example:**
```typescript
await track('chat_generation', {
  mode: agentMode, // 'fast', 'quality', or 'agentic'
  provider: selectedProvider,
  knowledge_graph_used: !!graphNodes.length
});
```

**Image Example:**
```typescript
await track('image_generation', {
  resolution: resolution,
  amount: amount
});
```

## 2. Client-Side Tracking (UI Interactions & Conversions)
Client-side tracking is required for button clicks, form submissions, and interactions that do not trigger a backend API generation route.

**Implementation:**
Import the client-side tracking module into relevant React Server/Client Components:
```typescript
import { track } from '@vercel/analytics/react';
```

Attach to `onClick` or `onSubmit` handlers.

**Target Components & Events:**
- **Creator Dashboard (`app/[locale]/(dashboard)/(routes)/creator/page.tsx`):**
  - `track('copy_referral_link')`
- **Creator Application (`app/[locale]/creators/apply/page.tsx`):**
  - `track('submit_creator_application')`
- **Settings / GitHub Connect (`components/github-connect.tsx`):**
  - `track('connect_github_initiated')`
- **Language Switcher (`components/language-switcher.tsx`):**
  - `track('language_changed', { locale: nextLocale })`
- **Theme Switcher (`components/theme-toggle.tsx`):**
  - `track('theme_changed', { theme: newTheme })`

## 3. Rate Limits & Constraints
- Vercel limits the number of custom event properties passed in the second argument of `track()`. Keep properties flat (no nested objects).
- Allowed property values: `strings`, `numbers`, `booleans`, and `null`.
- Max length: 255 characters per string.

## 4. Testing
Deploy to a preview branch or `main`. Verify events populate in the Vercel Dashboard -> Analytics -> Events tab. Note: Custom events do not affect the Bounce Rate calculation (which remains strictly Single-Page Sessions / Total Sessions).
