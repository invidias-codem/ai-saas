// jest.setup.js

process.env.NODE_ENV ??= "test";
process.env.NEXT_PUBLIC_APP_URL ??= "https://app.example.com";

// Prevent runtime credential lookups from producing noisy logs and conditional behavior.
process.env.GCP_SERVICE_ACCOUNT_KEY_JSON ??= "{}";
process.env.FIREBASE_PROJECT_ID ??= "test-project";
process.env.GOOGLE_PROJECT_ID ??= "test-project";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    rpc: jest.fn(async () => ({ data: {}, error: null })),
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => ({ data: {}, error: null })),
        })),
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(async () => ({ data: {}, error: null })),
        })),
      })),
    })),
  })),
}));
// Keep unset by default so Slack signature verification doesn't unexpectedly fail tests.
// Individual Slack tests can set this explicitly when they generate valid signatures.
delete process.env.SLACK_SIGNING_SECRET;

// Mock firebase-admin
jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn().mockReturnValue({}),
  app: jest.fn().mockReturnValue({}),
  firestore: jest.fn(() => ({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      exists: true,
      data: jest.fn().mockReturnValue({}),
    }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock axios
jest.mock("axios", () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  put: jest.fn(),
}));

// Mock Google Generative AI (avoid real network calls in tests)
jest.mock("@google/generative-ai", () => {
  const buildClassification = (input) => {
    const msg = String(input || "");
    const lower = msg.toLowerCase();

    const userLine = msg.match(/User message:\s*"([\s\S]*?)"/i);
    const userMessage = (userLine?.[1] ?? msg).trim();
    const userLower = userMessage.toLowerCase();

    if (!userMessage) {
      return { intent: "CHAT", confidence: 0.5 };
    }

    // Ambiguous requests should not be overly confident.
    if (/(create something cool|help me with my presentation|visualize this data|help with the meeting)/.test(userLower)) {
      return { intent: "CHAT", confidence: 0.75 };
    }

    // Prefer more specific intents before IMAGE.
    if (/(slide|slides|deck|presentation|powerpoint|pptx)/.test(userLower)) {
      const match = userLower.match(/(?:about|on)\s+(.+)/);
      return {
        intent: "SLIDES",
        confidence: 0.9,
        extractedInfo: { slideTopic: match?.[1]?.trim() || userMessage },
      };
    }

    if (/(schedule|meeting|calendar|invite|book)/.test(userLower)) {
      const emailMatch = userMessage.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
      return {
        intent: "CALENDAR",
        confidence: 0.85,
        extractedInfo: {
          meetingDetails: {
            attendees: emailMatch ? [emailMatch[0]] : [],
          },
        },
      };
    }

    if (/(image|picture|photo|logo|icon|gif|draw)/.test(userLower)) {
      const match = userLower.match(/(?:of|for)\s+(.+)/);
      return {
        intent: "IMAGE",
        confidence: 0.9,
        extractedInfo: { imagePrompt: match?.[1]?.trim() || userMessage },
      };
    }

    return { intent: "CHAT", confidence: 0.8 };
  };

  const makeResult = (payload) => ({
    response: {
      text: () => JSON.stringify(payload),
    },
  });

  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn(async (parts) => {
          const text = Array.isArray(parts)
            ? parts.map((p) => (typeof p === "string" ? p : p?.text || "")).join("\n")
            : String(parts || "");
          return makeResult(buildClassification(text));
        }),
        startChat: jest.fn().mockReturnValue({
          sendMessage: jest.fn().mockResolvedValue(makeResult({ text: "Generated content from Genie" })),
          sendMessageStream: jest.fn().mockResolvedValue({
            stream: (async function* () {
              yield { text: () => "Generated " };
              yield { text: () => "content " };
              yield { text: () => "from Genie" };
            })(),
            response: Promise.resolve({ text: () => "Generated content from Genie" }),
          }),
        }),
      }),
    })),
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
      HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
      HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
    },
    HarmBlockThreshold: {
      BLOCK_MEDIUM_AND_ABOVE: "BLOCK_MEDIUM_AND_ABOVE",
    },
  };
});

// Mock next/server
jest.mock("next/server", () => {
  const NextResponseCtor = jest.fn((body, init) => ({
    status: init?.status || 200,
    json: jest.fn(async () => (typeof body === "string" ? JSON.parse(body) : body)),
    text: jest.fn(async () => (typeof body === "string" ? body : JSON.stringify(body))),
    headers: new Headers(init?.headers || {}),
  }));

  return {
    NextRequest: jest.fn(),
    NextResponse: Object.assign(NextResponseCtor, {
      json: (data, init) => NextResponseCtor(JSON.stringify(data), {
        status: init?.status || 200,
        headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      }),
      redirect: (url, init) => NextResponseCtor(null, {
        status: typeof init === "number" ? init : init?.status || 307,
        headers: { location: String(url) },
      }),
    }),
  };
});
