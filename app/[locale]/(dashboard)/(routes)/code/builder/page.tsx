// Code Builder route — server-component shell (Phase 4A/4B).
// Route: /code/builder
//
// Dashboard invariant: page.tsx is an async Server Component; ALL
// interactivity (prompt, polling, realtime relay, panels) lives in the
// co-located CodeBuilderIsland client island. No data prefetch needed —
// the island's durable recovery path reads build state post-hydration
// (background polling is an allowed exception per the surface rules).

import CodeBuilderIsland from './CodeBuilderIsland';

export default function CodeBuilderPage() {
    return <CodeBuilderIsland />;
}
