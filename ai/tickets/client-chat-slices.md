# client.tsx tracer-bullet tickets

Methodology: to-tickets (vertical capability slices, blocking edges declared).

Monolith: app/[locale]/(dashboard)/(routes)/conversation/[id]/client.tsx (~63KB, ~1500 lines, ~37 hooks).

Blocking graph: 1,2,3,4,7 → 6 → 8.

- [ ] T1 chat-scroll — extract bottomRef/chatContainerRef/handleScroll/showScrollButton into chat/useChatScroll.ts + chat/ScrollToBottom.tsx. Edges: none.
- [ ] T2 attachments — selectedFile/showFilePreview/fileInputRef/handlers/upload fetch → chat/FileAttachmentPanel.tsx + chat/useFileUpload.ts. Edges: none.
- [ ] T3 session-sync — sessionId/deviceId/multiDeviceStatus/syncIntervalRef → chat/useSessionSync.ts. Edges: none.
- [ ] T4 github-action-modal — isGitHubModalOpen/gitHubAction/handlers → chat/GitHubActionModal.tsx. Edges: none.
- [ ] T5 memory-panel — memoryCount/isMemoryPulsing/swarmSuggestion/episodic fetch → chat/MemoryInsights.tsx. Edges: conversationContext prop.
- [ ] T6 streaming-pipeline — messages/userInput/streaming/streamingContent/handleSendMessage/handleKeyPress → chat/useChatStream.ts + chat/Composer.tsx. Edges: T1,T2,T4.
- [ ] T7 debug-overlay — debugExecutionMode/debugIntent → chat/DebugOverlay.tsx. Edges: none.
- [ ] T8 shell-collapse — residual greeting/menu/context-sheet stays in client.tsx as orchestrator. Edges: all prior.
