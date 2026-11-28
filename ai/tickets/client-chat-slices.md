# client.tsx tracer-bullet tickets

Methodology: to-tickets (vertical capability slices, blocking edges declared).

Monolith: app/[locale]/(dashboard)/(routes)/conversation/[id]/client.tsx (~63KB, ~1500 lines, ~37 hooks).
Result: 859 lines (~42% reduction), 9 co-located modules in components/chat/.

Blocking graph: 1,2,3,4,7 → 6 → 8.

- [x] T1 chat-scroll — extract bottomRef/chatContainerRef/handleScroll/showScrollButton into chat/useChatScroll.ts + chat/ScrollToBottom.tsx. Edges: none.
- [x] T2 attachments — selectedFile/showFilePreview/fileInputRef/handlers/upload fetch → chat/FileAttachmentPanel.tsx + chat/useFileUpload.ts. Edges: none.
- [x] T3 session-sync — sessionId/deviceId/multiDeviceStatus/syncIntervalRef → chat/useSessionSync.ts. Edges: none.
- [x] T4 github-action-modal — RESOLVED AS DEAD-CODE REMOVAL (gitHubAction/modal/confirm were vestigial; kept handleGitHubConnect OAuth button). Edges: none.
- [x] T5 memory-panel — memoryCount/isMemoryPulsing/swarmSuggestion/episodic fetch → chat/useMemoryInsights.ts + chat/MemoryInsights.tsx. Edges: conversationContext prop.
- [x] T6 streaming-pipeline — userInput/loading/streaming/streamingContent/handleSendMessage/handleKeyPress → chat/useChatStream.ts + chat/Composer.tsx (messages stays in orchestrator as shared source of truth). Edges: T1,T2,T4.
- [x] T7 debug-overlay — RESOLVED AS RuntimeStatusBar extraction (debugExecutionMode/debugIntent remain stream outputs; extracted the presentational badge). Edges: none.
- [x] T8 shell-collapse — residual greeting/menu/context-sheet stays in client.tsx as orchestrator; purged 7 orphaned imports + 1 dead variable. Edges: all prior.