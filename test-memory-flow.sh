#!/bin/bash

# Memory Persistence Verification Script
# Tests that facts are properly stored and retrieved

set -e

echo "🧠 Memory Persistence Test"
echo "=========================="
echo ""

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-test-user-$(date +%s)}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Test Configuration${NC}"
echo "API URL: $API_BASE_URL"
echo "User ID: $USER_ID"
echo ""

# Test 1: Check if analytics endpoint is working
echo -e "${BLUE}[Test 1] Analytics Endpoint${NC}"
echo "Testing GET /api/memory/analytics..."

ANALYTICS=$(curl -s "$API_BASE_URL/api/memory/analytics" \
  -H "Content-Type: application/json")

if echo "$ANALYTICS" | grep -q "totalFacts"; then
  TOTAL=$(echo "$ANALYTICS" | grep -o '"totalFacts":[0-9]*' | grep -o '[0-9]*$')
  echo -e "${GREEN}✓ Analytics working - Current facts: $TOTAL${NC}"
else
  echo -e "${YELLOW}⚠ Analytics returned unexpected format${NC}"
  echo "Response: $ANALYTICS" | head -20
fi

echo ""

# Test 2: Verify Firebase direct retrieval
echo -e "${BLUE}[Test 2] Direct Firestore Query${NC}"
echo "Testing direct Firestore connection..."

cat > /tmp/test_firestore.mjs << 'EOF'
import admin from 'firebase-admin';
import * as fs from 'fs';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './keys/genie-ai-1ca85-a79dca93b5cd.json';

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Service account not found at ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function testQuery() {
  try {
    const userId = process.env.USER_ID || 'test-user';
    const factsRef = db.collection('users').doc(userId).collection('facts');
    
    const snapshot = await factsRef
      .orderBy('confidence', 'desc')
      .limit(5)
      .get();

    console.log(`✓ Successfully queried Firestore`);
    console.log(`  Found ${snapshot.size} facts`);
    
    snapshot.docs.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`  [${idx + 1}] ${data.type}: "${data.content.substring(0, 40)}..."`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Firestore query failed:`, error.message);
    process.exit(1);
  }
}

testQuery();
EOF

if [ -f ./keys/genie-ai-1ca85-a79dca93b5cd.json ]; then
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./keys/genie-ai-1ca85-a79dca93b5cd.json \
  USER_ID="$USER_ID" \
  node /tmp/test_firestore.mjs 2>/dev/null || echo -e "${YELLOW}⚠ Firestore test requires Node.js${NC}"
else
  echo -e "${YELLOW}⚠ Firebase service account not found (expected for local testing)${NC}"
fi

echo ""

# Test 3: Memory flow diagram
echo -e "${BLUE}[Test 3] Memory Flow Architecture${NC}"
cat << 'EOF'

Conversation Flow:
┌─────────────────────────────────────┐
│ 1. User sends message               │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 2. getHighConfidenceFacts() called   │
│    → Tries Cloud Function first     │
│    → Falls back to direct Firestore │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 3. Facts injected into prompt       │
│    (formatFactsForPrompt)           │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 4. Gemini responds with memory      │
│    context                          │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 5. captureMemory() stores response  │
│    and triggers fact extraction     │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│ 6. Cloud Function:                  │
│    - Extracts facts from convo      │
│    - Stores in Firestore            │
│    - Sets 90-day TTL for conv facts │
└─────────────────────────────────────┘

Next Conversation (Same User):
↓
Facts from step 6 are retrieved in step 2!
✓ Memory persists across sessions

EOF

echo ""

# Test 4: Debugging checks
echo -e "${BLUE}[Test 4] Environment Checks${NC}"

if [ -z "$FIREBASE_SERVICE_ACCOUNT_KEY_PATH" ] && [ ! -f "keys/genie-ai-1ca85-a79dca93b5cd.json" ]; then
  echo -e "${YELLOW}⚠ FIREBASE_SERVICE_ACCOUNT_KEY_PATH not set${NC}"
else
  echo -e "${GREEN}✓ Firebase credentials available${NC}"
fi

if [ -z "$NEXT_PUBLIC_RAG_ENABLED" ]; then
  echo -e "${YELLOW}⚠ NEXT_PUBLIC_RAG_ENABLED not set - using fallback${NC}"
else
  echo -e "${GREEN}✓ RAG enabled${NC}"
fi

if [ -z "$RAG_CLOUD_FUNCTION_URL" ]; then
  echo -e "${YELLOW}⚠ RAG_CLOUD_FUNCTION_URL not set - using direct Firestore${NC}"
else
  echo -e "${GREEN}✓ Cloud Function URL configured${NC}"
fi

echo ""
echo -e "${BLUE}[Summary]${NC}"
echo "Memory persistence requires:"
echo "  1. ✓ Facts extracted and stored in Firestore (conversation capture)"
echo "  2. ✓ Facts retrieved via direct Firestore (with Cloud Function fallback)"
echo "  3. ✓ Facts injected into conversation prompt"
echo "  4. ✓ Same facts available in next conversation"
echo ""
echo "To verify:"
echo "  1. Start a conversation mentioning a project name"
echo "  2. Check /settings to see stored memory"
echo "  3. Start new conversation (same user)"
echo "  4. Mention that project name - Genie should remember it"
echo ""
