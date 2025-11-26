// jest.setup.js

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
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
}))

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  put: jest.fn(),
}))

// Mock next/server
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: jest.fn((body, config) => ({
    status: config?.status || 200,
    json: jest.fn(async () => body),
  })),
}))
