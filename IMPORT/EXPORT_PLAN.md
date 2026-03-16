# Research Plan: Cross-Platform Chat/Memory Export & Import for Genie



## Overview



This research plan investigates how to export chat histories and memories from major AI platforms (OpenAI, Gemini, Anthropic, Perplexity, Manus) and import them into Genie, enabling users to maintain persistent conversation context across different AI services.



---



## Phase 1: Understanding Current Genie Memory Architecture



Before designing an import system, I need to understand how Genie currently stores and manages memories and conversations.











Now let me search for how conversations are stored and the schema:



Now let me look at the API routes for conversations to understand the full data flow:







Now let me research the export capabilities of each AI platform. Let me search for any existing import/export functionality in the codebase first:



Now let me research the export capabilities of each AI platform by searching the web:















Now let me look at the Supabase schema to understand the database structure better:



Now I have a comprehensive understanding of the codebase and the research on external platforms. Let me compile the complete research plan.



---



# Research Plan: Cross-Platform Chat/Memory Export & Import for Genie



## Executive Summary



This document provides a comprehensive research plan for implementing a feature that allows users to **export chat histories and memories from major AI platforms** (OpenAI ChatGPT, Google Gemini, Anthropic Claude, Perplexity, and Manus) and **import them into Genie**, enabling persistent conversation context across different AI services.



---



## Phase 1: Platform Export Capabilities Analysis



### 1.1 OpenAI ChatGPT



**Export Method:** Manual data export via Settings



**How to Export:**

1. Navigate to Settings → Data Controls → Export Data

2. Request export (email link sent within 24 hours)

3. Download ZIP file containing:

   - `conversations.json` - All chat history

   - `chat.html` - HTML viewer

   - `model_comparisons.json` - A/B test data

   - `message_feedback.json` - User feedback

   - `shared_conversations.json` - Shared links



**Data Format (conversations.json):**

```json

{

  "title": "Conversation Title",

  "create_time": 1695000000.0,

  "update_time": 1695001000.0,

  "current_node": "uuid-of-current-node",

  "mapping": {

    "node-uuid": {

      "id": "node-uuid",

      "message": {

        "id": "message-uuid",

        "author": {

          "role": "user" | "assistant" | "system"

        },

        "content": {

          "content_type": "text",

          "parts": ["message content here"]

        },

        "create_time": 1695000000.0,

        "metadata": {

          "is_user_system_message": false

        }

      },

      "parent": "parent-node-uuid",

      "children": ["child-node-uuid"]

    }

  }

}

```



**Key Challenges:**

- Tree-based structure (not linear) - requires traversal from `current_node` up through `parent` references

- Format changes frequently (Canvas, Search, Deep Research features add complexity)

- No official API for export - manual process only



---



### 1.2 Anthropic Claude



**Export Method:** Manual data export via Settings



**How to Export:**

1. Navigate to Settings → Privacy → Export Data

2. Click "Export data" button

3. Receive download link via email (expires in 24 hours)

4. Must be signed in to download



**Data Format:** JSON (structure not publicly documented)



**Expected Structure (based on similar platforms):**

```json

{

  "conversations": [

    {

      "id": "conversation-uuid",

      "title": "Conversation Title",

      "created_at": "2024-01-15T10:30:00Z",

      "updated_at": "2024-01-15T11:45:00Z",

      "messages": [

        {

          "role": "human" | "assistant",

          "content": "message text",

          "timestamp": "2024-01-15T10:30:00Z"

        }

      ]

    }

  ],

  "user_data": {

    "email": "user@example.com",

    "preferences": {}

  }

}

```



**Key Challenges:**

- Export format not officially documented

- No API access for conversation retrieval

- Only available for individual accounts (free, Pro, Max)



---



### 1.3 Google Gemini



**Export Method:** Google Takeout



**How to Export:**

1. Go to [Google Takeout](https://takeout.google.com/)

2. Click "Deselect all"

3. Find and select "Gemini"

4. Click "Next step" → "Create export"

5. Receive email when ready (can take hours)



**Alternative Method:** Export to Google Docs

- Click "Share & export" on individual responses

- Select "Export to Docs"

- Download from Google Drive as PDF/DOCX



**Data Format:** 

- Takeout exports Gems data (instructions) but **NOT full chat history** (as of recent reports)

- Individual exports go to Google Docs format



**Key Challenges:**

- Google Takeout reportedly only exports Gems/instructions, not conversations

- No bulk export of all conversations

- Browser extensions may be needed for full export

- Format varies between export methods



---



### 1.4 Perplexity



**Export Method:** **NOT AVAILABLE** (as of research date)



**Current Status:**

- No bulk export feature exists

- Feature has been requested by community

- Individual threads can be shared via link

- No API for conversation retrieval



**Workarounds:**

- Manual copy/paste

- Browser extensions (unofficial)

- Share link → scrape content



**Key Challenges:**

- No official export capability

- Would require web scraping or unofficial methods

- Data portability is a significant gap



---



### 1.5 Manus AI



**Export Method:** Limited/Unclear



**Current Status:**

- Can request AI to create ZIP of generated files

- "Download all files" option exists but incomplete

- No documented conversation export

- Vendor lock-in concerns noted in research



**Key Challenges:**

- Unclear export policies

- Complex workarounds required (Replit → GitHub → Vercel)

- Session-based data may not persist

- Recently acquired by Meta - policies may change



---



## Phase 2: Genie's Current Memory Architecture



### 2.1 Data Storage Overview



Genie uses a **dual-storage architecture**:



| Storage | Purpose | Data Types |

|---------|---------|------------|

| **Supabase (PostgreSQL)** | Conversations, Messages, Memory Bank | Structured data, vector embeddings |

| **Firebase Firestore** | User facts, preferences, analytics | Document-based data |



### 2.2 Key Data Structures



**Conversations Table (Supabase):**

```sql

CREATE TABLE conversations (

    id UUID PRIMARY KEY,

    user_id TEXT NOT NULL,

    title TEXT NOT NULL,

    is_deleted BOOLEAN DEFAULT false,

    is_archived BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ,

    updated_at TIMESTAMPTZ

);

```



**Messages Table (Supabase):**

```sql

CREATE TABLE messages (

    id UUID PRIMARY KEY,

    conversation_id UUID REFERENCES conversations(id),

    role TEXT CHECK (role IN ('user', 'bot', 'assistant', 'system')),

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ

);

```



**Memory Bank (Supabase with pgvector):**

```sql

CREATE TABLE memory_bank (

    id UUID PRIMARY KEY,

    user_id TEXT NOT NULL,

    content TEXT NOT NULL,

    embedding vector(768),

    type TEXT, -- 'conversation_summary', 'fact', 'preference'

    metadata JSONB,

    created_at TIMESTAMPTZ

);

```



**Extracted Facts (Firebase):**

```typescript

interface ExtractedFact {

  id: string;

  type: 'conversation' | 'user' | 'preference';

  content: string;

  confidence: number;

  sentiment?: number;

  scope?: 'conversation' | 'user';

  extractedAt?: Date;

  expiresAt?: Date;

  usageCount?: number;

  impactScore?: number;

}

```



### 2.3 Memory Types in Genie



1. **Conversation Summaries** - Compressed summaries of past conversations

2. **Extracted Facts** - Key decisions, action items, blockers, projects

3. **User Preferences** - Communication style, preferred depth, topics

4. **RAG Context** - Vector-indexed memories for semantic retrieval



---



## Phase 3: Unified Import Schema Design



### 3.1 Proposed Universal Import Format



To support imports from multiple platforms, define a **Genie Universal Import Format (GUIF)**:



```typescript

interface GenieUniversalImport {

  version: "1.0";

  source: "openai" | "anthropic" | "gemini" | "perplexity" | "manus" | "other";

  exportedAt: string; // ISO 8601

  

  conversations: ImportedConversation[];

  memories?: ImportedMemory[];

  preferences?: ImportedPreferences;

}



interface ImportedConversation {

  externalId?: string; // Original platform ID

  title: string;

  createdAt: string;

  updatedAt: string;

  messages: ImportedMessage[];

  metadata?: Record<string, any>;

}



interface ImportedMessage {

  role: "user" | "assistant" | "system";

  content: string;

  timestamp: string;

  metadata?: {

    model?: string;

    tokens?: number;

    attachments?: string[];

  };

}



interface ImportedMemory {

  type: "fact" | "preference" | "summary";

  content: string;

  confidence?: number;

  extractedFrom?: string; // conversation ID

  createdAt: string;

}



interface ImportedPreferences {

  communicationStyle?: string;

  preferredDepth?: string;

  topics?: string[];

  customInstructions?: string;

}

```



### 3.2 Platform-Specific Parsers



Each platform requires a dedicated parser to convert to GUIF:



```typescript

// Parser interface

interface PlatformParser {

  platform: string;

  supportedFormats: string[];

  parse(data: any): GenieUniversalImport;

  validate(data: any): ValidationResult;

}



// Example: OpenAI Parser

class OpenAIParser implements PlatformParser {

  platform = "openai";

  supportedFormats = ["conversations.json"];

  

  parse(data: OpenAIExport): GenieUniversalImport {

    return {

      version: "1.0",

      source: "openai",

      exportedAt: new Date().toISOString(),

      conversations: data.map(conv => this.parseConversation(conv))

    };

  }

  

  private parseConversation(conv: OpenAIConversation): ImportedConversation {

    const messages = this.traverseMessageTree(conv.mapping, conv.current_node);

    return {

      externalId: conv.id,

      title: conv.title,

      createdAt: new Date(conv.create_time * 1000).toISOString(),

      updatedAt: new Date(conv.update_time * 1000).toISOString(),

      messages

    };

  }

  

  private traverseMessageTree(mapping: any, currentNode: string): ImportedMessage[] {

    // Traverse from current_node up through parents, then reverse

    const messages: ImportedMessage[] = [];

    let node = currentNode;

    

    while (node && mapping[node]) {

      const nodeData = mapping[node];

      if (nodeData.message?.content?.parts?.length > 0) {

        const role = nodeData.message.author.role;

        if (role !== 'system' || nodeData.message.metadata?.is_user_system_message) {

          messages.unshift({

            role: role === 'assistant' ? 'assistant' : 'user',

            content: nodeData.message.content.parts[0],

            timestamp: new Date(nodeData.message.create_time * 1000).toISOString()

          });

        }

      }

      node = nodeData.parent;

    }

    

    return messages;

  }

}

```



---



## Phase 4: Implementation Plan



### 4.1 New API Endpoints



| Endpoint | Method | Purpose |

|----------|--------|---------|

| `/api/import/upload` | POST | Upload export file |

| `/api/import/parse` | POST | Parse and validate file |

| `/api/import/preview` | GET | Preview import data |

| `/api/import/execute` | POST | Execute import |

| `/api/import/status/:id` | GET | Check import status |

| `/api/export/genie` | GET | Export Genie data |



### 4.2 File Structure for New Components



```

lib/

├── import/

│   ├── index.ts              # Main import orchestrator

│   ├── parsers/

│   │   ├── openai.ts         # OpenAI parser

│   │   ├── anthropic.ts      # Claude parser

│   │   ├── gemini.ts         # Gemini parser

│   │   ├── perplexity.ts     # Perplexity parser (placeholder)

│   │   └── manus.ts          # Manus parser (placeholder)

│   ├── validators/

│   │   └── schema.ts         # GUIF validation

│   ├── transformers/

│   │   └── toGenie.ts        # Transform GUIF to Genie format

│   └── types.ts              # TypeScript interfaces



app/

├── api/

│   └── import/

│       ├── upload/route.ts

│       ├── parse/route.ts

│       ├── preview/route.ts

│       ├── execute/route.ts

│       └── status/[id]/route.ts



components/

├── import/

│   ├── ImportWizard.tsx      # Multi-step import UI

│   ├── PlatformSelector.tsx  # Platform selection

│   ├── FileUploader.tsx      # Drag-drop file upload

│   ├── ImportPreview.tsx     # Preview imported data

│   └── ImportProgress.tsx    # Progress indicator

```



### 4.3 Database Migrations



```sql

-- Migration: Add import tracking table

CREATE TABLE IF NOT EXISTS public.imports (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id TEXT NOT NULL,

    source_platform TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    file_name TEXT,

    conversations_imported INTEGER DEFAULT 0,

    messages_imported INTEGER DEFAULT 0,

    memories_imported INTEGER DEFAULT 0,

    errors JSONB DEFAULT '[]'::jsonb,

    started_at TIMESTAMPTZ DEFAULT NOW(),

    completed_at TIMESTAMPTZ,

    metadata JSONB DEFAULT '{}'::jsonb

);



-- Add source tracking to conversations

ALTER TABLE public.conversations 

ADD COLUMN IF NOT EXISTS source_platform TEXT DEFAULT 'genie',

ADD COLUMN IF NOT EXISTS external_id TEXT,

ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id);



-- Index for finding imported conversations

CREATE INDEX IF NOT EXISTS idx_conversations_import 

ON public.conversations(import_id) WHERE import_id IS NOT NULL;

```



### 4.4 Import Flow Diagram



```

┌─────────────────┐

│  User uploads   │

│  export file    │

└────────┬────────┘

         │

         ▼

┌─────────────────┐

│ Detect platform │

│ (file analysis) │

└────────┬────────┘

         │

         ▼

┌─────────────────┐

│ Parse with      │

│ platform parser │

└────────┬────────┘

         │

         ▼

┌─────────────────┐

│ Validate GUIF   │

│ schema          │

└────────┬────────┘

         │

         ▼

┌─────────────────┐

│ Show preview    │

│ to user         │

└────────┬────────┘

         │

         ▼

┌─────────────────┐

│ User confirms   │

│ import options  │

└────────┬────────┘

         │

         ▼

┌─────────────────┐     ┌─────────────────┐

│ Create          │────▶│ Generate        │

│ conversations   │     │ embeddings      │

└────────┬────────┘     └────────┬────────┘

         │                       │

         ▼                       ▼

┌─────────────────┐     ┌─────────────────┐

│ Insert messages │     │ Extract facts   │

│ to Supabase     │     │ (optional)      │

└────────┬────────┘     └────────┬────────┘

         │                       │

         └───────────┬───────────┘

                     │

                     ▼

            ┌─────────────────┐

            │ Import complete │

            │ Show summary    │

            └─────────────────┘

```



---



## Phase 5: UI/UX Design



### 5.1 Import Wizard Steps



1. **Platform Selection**

   - Grid of supported platforms with icons

   - "Other/Custom" option for manual format



2. **File Upload**

   - Drag-and-drop zone

   - Instructions specific to selected platform

   - Link to platform's export instructions



3. **Preview & Options**

   - Show conversation count, date range

   - Toggle: Import as new conversations vs. merge

   - Toggle: Extract memories from conversations

   - Toggle: Import custom instructions as preferences



4. **Confirmation**

   - Summary of what will be imported

   - Warning about duplicate detection

   - "Import" button



5. **Progress & Results**

   - Real-time progress bar

   - Success/error counts

   - Link to view imported conversations



### 5.2 Settings Page Addition



Add to user settings:

- **Data Import** section

- **Data Export** section (export Genie data in GUIF format)

- **Import History** - list of past imports with status



---



## Phase 6: Memory Extraction from Imports



### 6.1 Automatic Fact Extraction



When importing conversations, optionally run fact extraction:



```typescript

async function extractFactsFromImport(

  conversations: ImportedConversation[],

  userId: string

): Promise<ExtractedFact[]> {

  const facts: ExtractedFact[] = [];

  

  for (const conv of conversations) {

    // Use existing fact extraction logic

    const conversationText = conv.messages

      .map(m => `${m.role}: ${m.content}`)

      .join('\n');

    

    const extracted = await extractFactsFromConversation(

      conversationText,

      userId,

      conv.externalId

    );

    

    facts.push(...extracted);

  }

  

  return facts;

}

```



### 6.2 Memory Deduplication



Prevent duplicate memories when importing:



```typescript

async function deduplicateMemories(

  newMemories: ImportedMemory[],

  userId: string

): Promise<ImportedMemory[]> {

  const existingMemories = await searchMemories(userId, '', 1000);

  

  return newMemories.filter(newMem => {

    // Check semantic similarity with existing memories

    const isDuplicate = existingMemories.some(existing => 

      calculateSimilarity(newMem.content, existing.content) > 0.9

    );

    return !isDuplicate;

  });

}

```



---



## Phase 7: Success Criteria & Metrics



### 7.1 Functional Requirements



| Requirement | Priority | Status |

|-------------|----------|--------|

| Parse OpenAI conversations.json | P0 | To implement |

| Parse Claude export format | P0 | To implement |

| Parse Gemini Takeout data | P1 | To implement |

| Handle Perplexity (when available) | P2 | Placeholder |

| Handle Manus (when available) | P2 | Placeholder |

| Preview before import | P0 | To implement |

| Progress tracking | P1 | To implement |

| Error handling & recovery | P0 | To implement |

| Duplicate detection | P1 | To implement |

| Memory extraction | P2 | To implement |



### 7.2 Performance Targets



- Parse 1000 conversations in < 30 seconds

- Import 1000 conversations in < 2 minutes

- Generate embeddings in background (non-blocking)

- Support files up to 100MB



### 7.3 User Experience Metrics



- Import completion rate > 95%

- User satisfaction score > 4/5

- Support tickets related to import < 5% of imports



---



## Phase 8: Open Questions & Risks



### 8.1 Open Questions



1. **Format Changes**: How to handle when platforms change export formats?

   - *Recommendation*: Version parsers, maintain changelog, community contributions



2. **Large Imports**: How to handle users with 10,000+ conversations?

   - *Recommendation*: Chunked processing, background jobs, progress persistence



3. **Privacy**: Should we store original platform IDs?

   - *Recommendation*: Optional, useful for deduplication on re-import



4. **Memories**: Should imported conversations automatically generate memories?

   - *Recommendation*: User toggle, default off for large imports



### 8.2 Risks



| Risk | Impact | Mitigation |

|------|--------|------------|

| Platform format changes | High | Version parsers, automated tests |

| Large file handling | Medium | Streaming parser, chunked processing |

| Duplicate imports | Medium | Hash-based deduplication |

| Rate limiting on embedding generation | Medium | Queue system, batch processing |

| User confusion | Low | Clear UI, help documentation |



---



## Phase 9: Implementation Timeline



### Suggested Phases



**Phase A (2-3 weeks): Core Infrastructure**

- [ ] Define GUIF schema

- [ ] Create import API endpoints

- [ ] Build OpenAI parser (most common)

- [ ] Basic import UI



**Phase B (2 weeks): Additional Parsers**

- [ ] Claude parser

- [ ] Gemini parser

- [ ] Validation & error handling



**Phase C (1-2 weeks): Polish & Features**

- [ ] Memory extraction integration

- [ ] Duplicate detection

- [ ] Import history

- [ ] Export Genie data feature



**Phase D (Ongoing): Maintenance**

- [ ] Monitor for format changes

- [ ] Add new platforms as they support export

- [ ] Community feedback integration



---



## Appendix A: Sample Parser Implementation



```typescript

// lib/import/parsers/openai.ts



import { GenieUniversalImport, ImportedConversation, ImportedMessage } from '../types';



interface OpenAIConversation {

  title: string;

  create_time: number;

  update_time: number;

  current_node: string;

  mapping: Record<string, OpenAINode>;

}



interface OpenAINode {

  id: string;

  message?: {

    id: string;

    author: { role: string };

    content: { content_type: string; parts: string[] };

    create_time: number;

    metadata?: { is_user_system_message?: boolean };

  };

  parent?: string;

  children?: string[];

}



export function parseOpenAIExport(data: OpenAIConversation[]): GenieUniversalImport {

  const conversations: ImportedConversation[] = [];

  

  for (const conv of data) {

    if (!conv.mapping || !conv.current_node) continue;

    

    const messages = extractMessages(conv.mapping, conv.current_node);

    

    conversations.push({

      externalId: conv.current_node,

      title: conv.title || 'Untitled Conversation',

      createdAt: new Date(conv.create_time * 1000).toISOString(),

      updatedAt: new Date(conv.update_time * 1000).toISOString(),

      messages

    });

  }

  

  return {

    version: "1.0",

    source: "openai",

    exportedAt: new Date().toISOString(),

    conversations

  };

}



function extractMessages(mapping: Record<string, OpenAINode>, currentNode: string): ImportedMessage[] {

  const messages: ImportedMessage[] = [];

  let nodeId: string | undefined = currentNode;

  

  // Traverse from current node to root

  while (nodeId && mapping[nodeId]) {

    const node = mapping[nodeId];

    

    if (node.message?.content?.parts?.length > 0) {

      const role = node.message.author.role;

      const isSystemMessage = role === 'system' && !node.message.metadata?.is_user_system_message;

      

      if (!isSystemMessage) {

        messages.unshift({

          role: role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user',

          content: node.message.content.parts.join('\n'),

          timestamp: new Date(node.message.create_time * 1000).toISOString()

        });

      }

    }

    

    nodeId = node.parent;

  }

  

  return messages;

}

```



---



## Appendix B: References



1. **OpenAI Export Format**: Community reverse-engineering efforts documented at OpenAI Developer Forum

2. **Claude Export**: Official support article at support.claude.com

3. **Gemini Export**: Google Takeout documentation and community reports

4. **Perplexity**: Feature request threads indicate no current export capability

5. **Manus**: Limited documentation, vendor lock-in concerns noted



---



This research plan provides a comprehensive foundation for implementing cross-platform chat/memory import functionality in Genie. The modular parser architecture allows for easy addition of new platforms as they become available or change their export formats.