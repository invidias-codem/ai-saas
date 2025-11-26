#!/bin/bash

# Memory Retention Test Script
# Tests the RAG memory system end-to-end
# Usage: chmod +x test-memory.sh && ./test-memory.sh

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RAG_URL="${RAG_CLOUD_FUNCTION_URL:-https://us-central1-genie-ai-1ca85.cloudfunctions.net}"
TEST_USER_ID="${TEST_USER_ID:-test-user-$(date +%s)}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Genie AI - Memory Retention Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Test 1: Check Environment Variables
echo -e "${YELLOW}[TEST 1] Checking environment configuration...${NC}"
if [ -z "$RAG_CLOUD_FUNCTION_URL" ]; then
  echo -e "${RED}✗ RAG_CLOUD_FUNCTION_URL not set${NC}"
  echo "  Set it with: export RAG_CLOUD_FUNCTION_URL=https://us-central1-genie-ai-1ca85.cloudfunctions.net"
else
  echo -e "${GREEN}✓ RAG_CLOUD_FUNCTION_URL: $RAG_CLOUD_FUNCTION_URL${NC}"
fi

if [ -z "$GOOGLE_API_KEY" ]; then
  echo -e "${RED}✗ GOOGLE_API_KEY not set${NC}"
else
  echo -e "${GREEN}✓ GOOGLE_API_KEY configured${NC}"
fi

if [ -z "$CLERK_SECRET_KEY" ]; then
  echo -e "${RED}✗ CLERK_SECRET_KEY not set${NC}"
else
  echo -e "${GREEN}✓ CLERK_SECRET_KEY configured${NC}"
fi
echo ""

# Test 2: Test Cloud Function Connectivity
echo -e "${YELLOW}[TEST 2] Testing Cloud Function connectivity...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$RAG_URL/retrieveMemories" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"test\", \"query\": \"test\"}")

if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✓ Cloud Function is reachable (HTTP $HTTP_CODE - expected bad request due to validation)${NC}"
elif [ "$HTTP_CODE" = "401" ]; then
  echo -e "${YELLOW}⚠ Cloud Function returned 401 - May need authentication${NC}"
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "${RED}✗ Cloud Function not found at $RAG_URL${NC}"
  echo "  Make sure functions are deployed: firebase deploy --only functions"
else
  echo -e "${BLUE}ℹ Cloud Function returned HTTP $HTTP_CODE${NC}"
fi
echo ""

# Test 3: Test Memory Retrieval (Should return empty for new user)
echo -e "${YELLOW}[TEST 3] Testing memory retrieval (fresh user)...${NC}"
RETRIEVE_RESPONSE=$(curl -s "$RAG_URL/retrieveMemories" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"query\": \"test query\",
    \"featureType\": \"conversation\",
    \"limit\": 5
  }")

echo "Response: $RETRIEVE_RESPONSE"

if echo "$RETRIEVE_RESPONSE" | grep -q "\"success\":true"; then
  MEMORY_COUNT=$(echo "$RETRIEVE_RESPONSE" | grep -o "\"count\":[0-9]*" | cut -d: -f2)
  echo -e "${GREEN}✓ Memory retrieval successful (found $MEMORY_COUNT memories)${NC}"
else
  echo -e "${RED}✗ Memory retrieval failed${NC}"
fi
echo ""

# Test 4: Test Memory Capture
echo -e "${YELLOW}[TEST 4] Testing memory capture...${NC}"
CAPTURE_RESPONSE=$(curl -s "$RAG_URL/captureConversationMemory" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"featureType\": \"conversation\",
    \"title\": \"Test Memory - $(date)\",
    \"summary\": \"This is a test memory to verify the capture system is working\",
    \"messages\": [
      {\"role\": \"user\", \"content\": \"Hello, my name is Alex and I work as a data scientist\"},
      {\"role\": \"assistant\", \"content\": \"Nice to meet you, Alex! Data science is fascinating\"}
    ],
    \"tokensUsed\": 150,
    \"tags\": [\"test\", \"verification\"]
  }")

echo "Response: $CAPTURE_RESPONSE"

if echo "$CAPTURE_RESPONSE" | grep -q "\"success\":true"; then
  MEMORY_ID=$(echo "$CAPTURE_RESPONSE" | grep -o "\"memoryId\":\"[^\"]*\"" | cut -d'"' -f4)
  echo -e "${GREEN}✓ Memory capture successful (ID: $MEMORY_ID)${NC}"
else
  echo -e "${RED}✗ Memory capture failed${NC}"
fi
echo ""

# Test 5: Test Memory Retrieval After Capture
echo -e "${YELLOW}[TEST 5] Testing memory retrieval after capture...${NC}"
sleep 2  # Wait for Firestore to sync

RETRIEVE_RESPONSE_2=$(curl -s "$RAG_URL/retrieveMemories" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"query\": \"data scientist work\",
    \"featureType\": \"conversation\",
    \"limit\": 5
  }")

echo "Response: $RETRIEVE_RESPONSE_2"

if echo "$RETRIEVE_RESPONSE_2" | grep -q "\"success\":true"; then
  MEMORY_COUNT=$(echo "$RETRIEVE_RESPONSE_2" | grep -o "\"count\":[0-9]*" | cut -d: -f2)
  echo -e "${GREEN}✓ Memory retrieval after capture successful (found $MEMORY_COUNT memories)${NC}"
  
  if [ "$MEMORY_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Memory was successfully persisted and retrieved!${NC}"
  fi
else
  echo -e "${RED}✗ Memory retrieval after capture failed${NC}"
fi
echo ""

# Test 6: Firebase Configuration Check
echo -e "${YELLOW}[TEST 6] Checking Firebase CLI and authentication...${NC}"
if command -v firebase &> /dev/null; then
  echo -e "${GREEN}✓ Firebase CLI installed${NC}"
  
  # Check if logged in
  if firebase projects:list > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Firebase authenticated${NC}"
    
    # Check deployed functions
    echo -e "${BLUE}ℹ Deployed Cloud Functions:${NC}"
    firebase functions:list 2>/dev/null | tail -n +2 | head -n 10 || echo "  (Could not retrieve list)"
  else
    echo -e "${YELLOW}⚠ Firebase not authenticated (run: firebase login)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Firebase CLI not installed${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ All tests completed${NC}"
echo ""
echo "Next steps:"
echo "1. If all tests passed, memory system is working!"
echo "2. Try sending messages in the Genie AI conversation"
echo "3. Check DevTools Network tab to verify /api/conversation requests"
echo "4. Check Firestore at Firebase Console → Database"
echo "5. Look for users/{userId}/memories collections"
echo ""
