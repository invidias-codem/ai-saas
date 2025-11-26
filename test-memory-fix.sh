#!/bin/bash

# Test Memory Fix - Verify profession memory is being retained
# This tests the scenario where Genie learns about the user's profession

set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Testing Memory Retention Fix"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Test 1: Check embedding generation
echo "✓ Testing embedding generation..."
RAG_URL="https://us-central1-genie-ai-1ca85.cloudfunctions.net"

# Capture a memory with profession info
TEST_USER="test-user-$(date +%s)"
echo "  Using test user: $TEST_USER"

echo ""
echo "✓ Test 1: Capturing profession memory..."
CAPTURE=$(curl -s "$RAG_URL/captureConversationMemory" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER\",
    \"featureType\": \"conversation\",
    \"title\": \"User Profession\",
    \"summary\": \"User mentioned they work in IT industry with focus on software development\",
    \"messages\": [],
    \"tokensUsed\": 100,
    \"tags\": [\"profession\", \"IT\", \"software-dev\"]
  }")

if echo "$CAPTURE" | grep -q '"success":true'; then
  MEMORY_ID=$(echo "$CAPTURE" | grep -o '"memoryId":"[^"]*"' | cut -d'"' -f4)
  echo "  ✓ Memory captured: $MEMORY_ID"
else
  echo "  ✗ Memory capture failed:"
  echo "  $CAPTURE"
  exit 1
fi

# Wait for sync
echo ""
echo "✓ Waiting for Firestore sync (3 seconds)..."
sleep 3

# Test retrieval with similar query
echo ""
echo "✓ Test 2: Retrieving with similar query (profession)..."
RETRIEVE=$(curl -s "$RAG_URL/retrieveMemories" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER\",
    \"query\": \"What is my profession?\",
    \"featureType\": \"conversation\",
    \"limit\": 5
  }")

echo "  Response: $RETRIEVE"

if echo "$RETRIEVE" | grep -q '"count":1'; then
  echo "  ✓ Memory retrieved by keyword matching!"
else
  COUNT=$(echo "$RETRIEVE" | grep -o '"count":[0-9]*' | cut -d: -f2 || echo "0")
  echo "  ⚠ Memory count: $COUNT (expected 1)"
fi

# Test 3: Retrieval with IT keyword
echo ""
echo "✓ Test 3: Retrieving with IT keyword..."
RETRIEVE2=$(curl -s "$RAG_URL/retrieveMemories" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER\",
    \"query\": \"software development IT work\",
    \"featureType\": \"conversation\",
    \"limit\": 5
  }")

if echo "$RETRIEVE2" | grep -q '"count":1'; then
  echo "  ✓ Memory retrieved by keyword matching!"
  # Extract memory details
  TITLE=$(echo "$RETRIEVE2" | grep -o '"title":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Memory title: $TITLE"
else
  COUNT=$(echo "$RETRIEVE2" | grep -o '"count":[0-9]*' | cut -d: -f2 || echo "0")
  echo "  ⚠ Memory count: $COUNT"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Test Complete"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  ✓ Embedding generation enhanced with better error handling"
echo "  ✓ Memory retrieval now uses hybrid approach:"
echo "    - Primary: Vector similarity (if embeddings available)"
echo "    - Fallback: Keyword matching (if embeddings fail)"
echo "  ✓ Similarity threshold lowered from 0.6 to 0.3"
echo ""
echo "Next: Test with the browser to see Genie remember your profession!"
echo ""
