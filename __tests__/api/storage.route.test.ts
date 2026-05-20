/**
 * Unit and integration tests for /api/storage/sign route.
 * 
 * Verifies auth verification, filename sanitization, content-type whitelist validation,
 * and signed URL generation logic under different scenario mockings.
 */

// Mock next/server before importing POST
jest.mock("next/server", () => {
  return {
    NextResponse: {
      json: (body: any, init?: ResponseInit) => {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
});

import { POST } from "@/app/api/storage/sign/route";

// Setup GCP storage client mocks
const mockGetSignedUrl = jest.fn();
const mockFile = jest.fn();
const mockBucket = jest.fn();
const mockStorageClient = {
  bucket: mockBucket,
};

// Mock the GCP helper client
jest.mock("@/lib/gcp/storage", () => {
  const actual = jest.requireActual("@/lib/gcp/storage");
  return {
    ...actual,
    getStorageClient: jest.fn(() => mockStorageClient),
    getStorageProjectId: jest.fn(() => "test-project-123"),
  };
});

// Mock clerk auth
jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
}));

const { auth } = jest.requireMock("@clerk/nextjs/server");
const { getStorageClient, getStorageProjectId } = jest.requireMock("@/lib/gcp/storage");
const { GCPConfigurationError } = jest.requireActual("@/lib/gcp/storage");

describe("POST /api/storage/sign", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock setup for successful execution
    auth.mockResolvedValue({ userId: "user_test_987" });
    getStorageClient.mockReturnValue(mockStorageClient);
    getStorageProjectId.mockReturnValue("test-project-123");
    
    mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-url-for-upload"]);
    mockFile.mockReturnValue({
      getSignedUrl: mockGetSignedUrl,
    });
    mockBucket.mockReturnValue({
      file: mockFile,
    });
  });

  function makeReq(body: any) {
    return new Request("http://localhost/api/storage/sign", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  // --- 1. Auth Verification Tests ---
  
  test("returns 401 Unauthorized if no user is authenticated", async () => {
    auth.mockResolvedValue({ userId: null });

    const res = await POST(makeReq({ filename: "avatar.png", contentType: "image/png" }));
    expect(res.status).toBe(401);
    
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("succeeds if user is authenticated", async () => {
    auth.mockResolvedValue({ userId: "user_valid_123" });

    const res = await POST(makeReq({ filename: "avatar.png", contentType: "image/png" }));
    expect(res.status).toBe(200);
  });

  // --- 2. Input Validation Tests ---

  test("returns 400 if request body has invalid JSON", async () => {
    const res = await POST(makeReq("{ invalid-json-payload"));
    expect(res.status).toBe(400);
    
    const data = await res.json();
    expect(data.error).toBe("Invalid JSON payload");
  });

  test("returns 400 if filename is missing", async () => {
    const res = await POST(makeReq({ contentType: "image/png" }));
    expect(res.status).toBe(400);
    
    const data = await res.json();
    expect(data.error).toBe("Missing filename or contentType");
  });

  test("returns 400 if contentType is missing", async () => {
    const res = await POST(makeReq({ filename: "image.png" }));
    expect(res.status).toBe(400);
    
    const data = await res.json();
    expect(data.error).toBe("Missing filename or contentType");
  });

  // --- 3. Content-Type Whitelist Validation Tests ---

  test("allows white-listed content types", async () => {
    const allowedTypes = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "text/plain", "text/csv",
      "application/json",
      "video/mp4", "video/webm",
      "audio/mpeg", "audio/wav"
    ];

    for (const contentType of allowedTypes) {
      const res = await POST(makeReq({ filename: `test-file`, contentType }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.uploadUrl).toBe("https://storage.googleapis.com/signed-url-for-upload");
    }
  });

  test("returns 400 and rejects non-whitelisted content types", async () => {
    const disallowedTypes = [
      "application/octet-stream",
      "application/x-sh",
      "text/html",
      "image/svg+xml", // Not explicitly allowed in whitelist for upload safety
      "application/javascript"
    ];

    for (const contentType of disallowedTypes) {
      const res = await POST(makeReq({ filename: "file.sh", contentType }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("File type not allowed");
    }
  });

  // --- 4. Filename Sanitization & Path Structure Tests ---

  test("sanitizes file names containing directory traversal safely", async () => {
    const res = await POST(makeReq({ filename: "../../../etc/passwd", contentType: "image/png" }));
    expect(res.status).toBe(200);

    // Verify sanitizeFilename stripped the path traversal completely
    expect(mockFile).toHaveBeenCalledWith(expect.stringContaining("passwd"));
    expect(mockFile).not.toHaveBeenCalledWith(expect.stringContaining(".."));
    expect(mockFile).not.toHaveBeenCalledWith(expect.stringContaining("etc"));
  });

  test("replaces whitespace in filename with underscores and keeps safe characters", async () => {
    const res = await POST(makeReq({ filename: "my cool photo @2026.png", contentType: "image/png" }));
    expect(res.status).toBe(200);

    // Spaces replaced by underscores, @ replaced by empty since it's not allowed
    expect(mockFile).toHaveBeenCalledWith(expect.stringContaining("my_cool_photo_2026.png"));
  });

  test("uses safe fallback if sanitization leaves empty string or traversal dots", async () => {
    const res = await POST(makeReq({ filename: "/../..", contentType: "image/png" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    // Fallback file name starts with "file_" followed by a slice of uuid
    expect(mockFile).toHaveBeenCalledWith(expect.stringMatching(/user_test_987\/[a-f0-9-]+\/file_[a-f0-9]{8}/));
  });

  // --- 5. GCP Configuration and Server Errors Tests ---

  test("returns 500 Server Configuration Error when GCPConfigurationError is thrown", async () => {
    getStorageClient.mockImplementation(() => {
      throw new GCPConfigurationError("GCP Project ID is missing from configuration.");
    });

    const res = await POST(makeReq({ filename: "avatar.png", contentType: "image/png" }));
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe("Server Configuration Error");
    expect(data.message).toBe("Google Cloud Storage is not properly configured on this server.");
    expect(data.details).toContain("GCP Project ID is missing from configuration.");
  });

  test("returns 500 Internal Server Error when an unexpected error occurs during generation", async () => {
    mockGetSignedUrl.mockRejectedValue(new Error("GCP connection timeout"));

    const res = await POST(makeReq({ filename: "avatar.png", contentType: "image/png" }));
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe("Internal Server Error");
    expect(data.message).toBe("An error occurred during signed URL generation.");
  });

  // --- 6. Signed URL Parameters & Output Integration Tests ---

  test("correctly requests signed URL from GCP Storage and returns exact details", async () => {
    auth.mockResolvedValue({ userId: "user_custom_456" });
    getStorageProjectId.mockReturnValue("custom-project-id");

    const res = await POST(makeReq({ filename: "profile.jpg", contentType: "image/jpeg" }));
    expect(res.status).toBe(200);

    // Verify bucket name matches custom project ID
    expect(mockBucket).toHaveBeenCalledWith("genie-uploads-custom-project-id");

    // Verify filePath matches user_custom_456/uuid/profile.jpg
    const expectedPathPattern = /^user_custom_456\/[a-f0-9-]{36}\/profile.jpg$/;
    expect(mockFile).toHaveBeenCalledWith(expect.stringMatching(expectedPathPattern));

    // Verify getSignedUrl is called with correct options
    expect(mockGetSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
      version: "v4",
      action: "write",
      contentType: "image/jpeg",
    }));

    // Verify expires option is roughly 15 minutes in the future
    const passedOptions = mockGetSignedUrl.mock.calls[0][0];
    const now = Date.now();
    expect(passedOptions.expires).toBeGreaterThanOrEqual(now + 14 * 60 * 1000);
    expect(passedOptions.expires).toBeLessThanOrEqual(now + 16 * 60 * 1000);

    // Verify returned JSON matches expected schema
    const data = await res.json();
    expect(data.uploadUrl).toBe("https://storage.googleapis.com/signed-url-for-upload");
    expect(data.fileUri).toBe(`gs://genie-uploads-custom-project-id/${data.filePath}`);
    expect(data.fileId).toBeDefined();
    expect(data.filePath).toMatch(expectedPathPattern);
  });
});
