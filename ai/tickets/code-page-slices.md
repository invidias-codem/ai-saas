# code/page.tsx tracer-bullet tickets

Methodology: to-tickets (vertical capability slices, blocking edges declared).

Monolith: app/[locale]/(dashboard)/(routes)/code/page.tsx (~44KB, 1034 lines). Sibling of the
conversation/[id]/client.tsx monolith already dismantled (T1–T8, see
client-chat-slices.md). Reuses the same hooks extracted there where shapes match.

Module-scope pieces: CodeBlock (useClipboard), TypingIndicator, helper fns
codeConversationRowKey / getLocalCodeSessionId, local types (CodeContext,
SelectedFile, Message).

Blocking graph: 1,2,5 → 7 → 8.

- [ ] C1 code-scroll — bottomRef/chatContainerRef/scrollToBottom/showScrollButton + effect → reuse chat/useChatScroll.ts + chat/ScrollToBottom.tsx (green accent prop). Edges: none.
- [ ] C2 file-attachment — selectedFile/fileInputRef/readFileAsBase64/handleAttachClick/handleFileChange/saveToMemory → chat/useCodeFileUpload.ts + code/FileAttachmentPill.tsx (code has no GCS/base64 split; plain base64 only). Edges: none.
- [ ] C3 github-repo-context — activeRepo/isRepoModalOpen/linkedRepos/repoIndexed/reindexing/reindexError/reindexActiveRepo/handleGitHubClick/handleRepoIndexComplete + 4 effects → chat/useGithubRepoContext.ts + code/GithubRepoHeader.tsx. Edges: none.
- [ ] C4 github-consent-modal — isGitHubModalOpen/gitHubAction/handleGitHubActionConfirm. Edges: none. (NOTE: audit whether gitHubAction is dead — it's never set non-null here; confirm before extract-vs-remove.)
- [ ] C5 memory-count — memoryCount/isMemoryPulsing/fetchMemoryCount + 2 effects → reuse chat/useMemoryInsights.ts + code/MemoryBadge (green variant). Edges: none.
- [ ] C6 code-context-conversation — codeContext/conversationId/loadCodeContext/bootstrapCodeConversation/save-on-change → chat/useCodeConversation.ts. Edges: none.
- [ ] C7 streaming-send — messages/userInput/loading/error/showGreeting/handleSendMessage/handleKeyPress → chat/useCodeStream.ts + code/Composer.tsx (messages stays in orchestrator). Edges: C1,C2,C3,C6.
- [ ] C8 shell-collapse — residual header/mobile-menu/message-list stays in page.tsx as orchestrator; purge orphans + dead state. Edges: all prior.