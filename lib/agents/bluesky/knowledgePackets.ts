export type BlueskyKnowledgePacketStatus =
  | "live"
  | "merged_not_verified_live"
  | "documented_direction"
  | "experimental";

export type BlueskyKnowledgePacketType =
  | "feature_update"
  | "architecture_explainer"
  | "product_philosophy"
  | "debug_lesson"
  | "support_docs_update"
  | "integration_update";

export interface BlueskyKnowledgePacket {
  topicId: string;
  topicTitle: string;
  topicType: BlueskyKnowledgePacketType;
  summary: string;
  safeClaim: string;
  whyItMatters: string;
  evidenceSources: string[];
  status: BlueskyKnowledgePacketStatus;
  antiHypeBoundary: string;
  preferredFraming: string;
  audienceFit: string[];
  postAngles: string[];
  followUpQuestionsLikely: string[];
  replySeeds: string[];
}

export const STARTER_BLUESKY_KNOWLEDGE_PACKETS: BlueskyKnowledgePacket[] = [
  {
    topicId: "docs-hub-001",
    topicTitle: "Public docs hub rewrite",
    topicType: "support_docs_update",
    summary:
      "Genie’s public docs page was rewritten into a real platform documentation hub instead of a lightweight marketing-style docs page.",
    safeClaim:
      "Genie now has a public docs hub that explains the platform through architecture, security, operations, reference material, and ADRs rather than just product-level copy.",
    whyItMatters:
      "This makes the product more transparent and gives users and developers a real map of how the system works.",
    evidenceSources: [
      "app/[locale]/(landing)/docs/page.tsx",
      "docs/overview/technology-transparency.md",
      "docs/architecture/system-architecture.md",
    ],
    status: "live",
    antiHypeBoundary:
      "Do not imply that the docs system is a full rendered MD portal for every repo doc yet.",
    preferredFraming:
      "Explain the docs hub as a transparency upgrade and architecture map, not as generic documentation polish.",
    audienceFit: ["developers", "technical founders", "AI builders"],
    postAngles: [
      "what changed on the docs surface",
      "why transparency matters for AI products",
      "why public docs should explain architecture and operations, not just features",
    ],
    followUpQuestionsLikely: [
      "What kind of docs are included?",
      "Is this public or behind sign-in?",
    ],
    replySeeds: [
      "It now covers architecture, security, operations, API/reference surfaces, and decision records.",
      "It’s public. We fixed the docs route gating so people can actually read it without auth friction.",
    ],
  },
  {
    topicId: "runtime-routing-001",
    topicTitle: "Server-resolved runtime routing",
    topicType: "architecture_explainer",
    summary:
      "Genie is documenting and increasingly routing runtime behavior on the server instead of pretending the client fully controls the final mode.",
    safeClaim:
      "Genie is moving away from naive client-side mode toggles toward backend runtime routing shaped by conversation, workspace, and operating-profile context.",
    whyItMatters:
      "This makes the product more honest and creates a stronger foundation for context-aware behavior.",
    evidenceSources: [
      "docs/architecture/runtime-mode-routing.md",
      "docs/decisions/adr-002-server-resolved-runtime-mode-routing.md",
    ],
    status: "live",
    antiHypeBoundary:
      "Do not imply that every runtime decision is perfectly personalized or that the system has fully mature adaptive routing everywhere.",
    preferredFraming:
      "Explain why client-side mode switches are a weak abstraction and why context-aware backend routing is more honest.",
    audienceFit: ["developers", "technical founders", "AI product builders"],
    postAngles: [
      "why fake chat mode toggles are bad UX",
      "what server-resolved routing means in practice",
      "why workspace and profile context matter",
    ],
    followUpQuestionsLikely: [
      "What do you mean by operating profile?",
      "Is this live or still conceptual?",
    ],
    replySeeds: [
      "Operating profiles are the layer that helps shape backend behavior for a workspace instead of leaving behavior as one flat default mode.",
      "The routing direction and docs are live; deeper profile-shaped behavior is still maturing across the platform.",
    ],
  },
  {
    topicId: "support-page-001",
    topicTitle: "Support page refocus",
    topicType: "feature_update",
    summary:
      "The support page was rewritten to focus on real support flows, docs, issue categories, and bug-report guidance instead of noisy community/chat cards.",
    safeClaim:
      "Genie’s support page now acts more like a structured help surface than a mixed community-links page.",
    whyItMatters:
      "A better support surface reduces friction and connects users to the right docs and debugging paths faster.",
    evidenceSources: [
      "app/[locale]/(landing)/support/page.tsx",
      "docs/operations/route-verification-checklist.md",
      "docs/operations/incident-debugging.md",
    ],
    status: "live",
    antiHypeBoundary:
      "Do not describe the support system as fully automated or enterprise-grade beyond what the page actually does.",
    preferredFraming:
      "Talk about clarity, docs integration, and issue-report quality rather than generic support excellence claims.",
    audienceFit: ["users", "developers", "technical operators"],
    postAngles: [
      "why we removed noisy support/community channels",
      "how support and docs now work together",
      "why better bug-report guidance matters",
    ],
    followUpQuestionsLikely: [
      "What support channels are left?",
      "Can I still find technical docs publicly?",
    ],
    replySeeds: [
      "The page now centers on direct support plus docs/resources instead of Slack and Telegram community cards.",
      "Yes, the docs are public and now much more architecture/operations focused.",
    ],
  },
  {
    topicId: "memory-context-001",
    topicTitle: "Prepared context direction",
    topicType: "architecture_explainer",
    summary:
      "Genie’s architecture direction treats context as something prepared from layers rather than simply stuffing raw chat history into the model.",
    safeClaim:
      "Genie is moving toward a prepared-context architecture where conversation state, workspace context, and future retrieval/memory layers are assembled more intentionally than a raw history-only system.",
    whyItMatters:
      "That architecture is more controllable, more debuggable, and a better foundation for memory-native behavior.",
    evidenceSources: [
      "docs/architecture/memory-and-context-architecture.md",
      "docs/decisions/adr-003-prepared-context-over-raw-history.md",
      "docs/architecture/retrieval-and-graph-strategy.md",
    ],
    status: "documented_direction",
    antiHypeBoundary:
      "Do not imply that Genie already has a perfect durable memory system or complete graph-native retrieval everywhere.",
    preferredFraming:
      "Explain the direction as intentional context assembly and stronger architecture, not magic memory.",
    audienceFit: ["developers", "AI builders", "technical founders"],
    postAngles: [
      "why raw chat history is a weak memory model",
      "what prepared context actually means",
      "why retrieval should support architecture rather than replace it",
    ],
    followUpQuestionsLikely: [
      "What makes this different from basic RAG?",
      "Is the memory system live or still directional?",
    ],
    replySeeds: [
      "The difference is that retrieval is being treated as a support layer inside a workspace-centric context pipeline, not the whole architecture.",
      "Parts are live in the architecture and docs; the deeper memory-native direction is still evolving.",
    ],
  },
];
