# code/page.tsx tracer-bullet tickets

Methodology: to-tickets (vertical capability slices, blocking edges declared).

Monolith: app/[locale]/(dashboard)/(routes)/code/page.tsx (~44KB, 1034 lines). Sibling of the
conversation/[id]/client.tsx monolith already dismantled (T1–T8, see
client-chat-slices.md). Reuses shared leaves extracted during that first refactor.

Result: 623 lines (~40% reduction), 6 new/extended modules in components/chat/, with
3 modules reused verbatim from the chat refactor.

Blocking graph: 1,2,5 → 7 → 8.

- [x] C1 code-scroll — reuse chat/useChatScroll.ts + chat/ScrollToBottom.tsx (added `accent` prop for green). Edges: none.
- [x] C2 file-attachment — chat/useCodeFileUpload.ts (base64-only + saveToMemory toggle). Edges: none.
- [x] C3 github-repo-context — chat/useGithubRepoContext.ts + header; WIRED the previously-unwired PATCH persist (latent bug → real persistence). Edges: none.
- [x] C4 github-consent-modal — RESOLVED AS DEAD-CODE REMOVAL (gitHubAction never set, modal never opened; mirror of chat T4). Edges: none.
- [x] C5 memory-count — split chat/useMemoryCount.ts out of useMemoryInsights; reuse + MemoryInsights `accent` prop. Edges: none.
- [x] C6 code-context-conversation — chat/useCodeConversation.ts (parallel profile hydration + row-backed bootstrap + save-on-change). Edges: none.
- [x] C7 streaming-send — chat/useCodeStream.ts (non-streaming POST /api/code; messages stays in orchestrator; shared `loading` flag kept in orchestrator and injected into both file-upload + stream hooks). Edges: C1,C2,C3,C6.
- [x] C8 shell-collapse — residual header/mobile-menu/message-list stays in page.tsx as orchestrator; purged 4 placeholder comments + dead state (showContextSheet) + orphaned imports/destructures (CODE_MODELS, setCodeModel, providerKeyState). Edges: all prior.