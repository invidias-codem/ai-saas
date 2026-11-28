// scripts/test-world-model.ts
// Deterministic test suite for Lattice OS World Model invariants.
// Run against a staging Supabase instance.
//
// Usage: npx tsx scripts/test-world-model.ts

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "../lib/ai/embeddings";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || "00000000-0000-0000-0000-000000000001";
const TEST_USER_ID = process.env.TEST_USER_ID || "test-user";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function setupTestWorkspace() {
  // Clean up any existing test data
  await supabase
    .from("knowledge_edges")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  await supabase
    .from("knowledge_nodes")
    .delete()
    .eq("user_id", TEST_USER_ID);

  await supabase
    .from("workspace_sources")
    .delete()
    .eq("workspace_id", TEST_WORKSPACE_ID);

  await supabase
    .from("wm_events")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: The Highlander Invariant (Only One Active State)
// ═══════════════════════════════════════════════════════════════════════════════

async function testHighlanderInvariant() {
  console.log("\n🏔️  TEST 1: Highlander Invariant (Split-Brain Guard)");

  const originUri = "https://test.example.com/invariant";

  // Step 1: Ingest original document (3 chunks)
  const originalChunks = [
    "Our enterprise plan costs $49/month with full API access.",
    "The startup tier is free for up to 1,000 requests per day.",
    "Enterprise customers receive 24/7 priority support.",
  ];

  const originalEmbeddings = await Promise.all(
    originalChunks.map((text) => generateEmbedding(text, TEST_USER_ID))
  );

  const originalRows = originalChunks.map((content, i) => ({
    workspace_id: TEST_WORKSPACE_ID,
    user_id: TEST_USER_ID,
    source_type: "url",
    title: "Test Document",
    origin_uri: originUri,
    raw_text: content,
    content,
    embedding: originalEmbeddings[i],
    metadata: { test: "highlander", chunk_index: i },
  }));

  const { data: insertedOrig } = await supabase
    .from("workspace_sources")
    .insert(originalRows)
    .select("id");

  // Step 2: Run delta detection (should return UNCHANGED for identical content)
  const { data: deltaResult } = await supabase.rpc("detect_workspace_source_delta", {
    new_embeddings: originalEmbeddings,
    target_workspace_id: TEST_WORKSPACE_ID,
    target_origin_uri: originUri,
    similarity_threshold: 0.98,
  });

  assert(deltaResult === "UNCHANGED", "Delta detection returns UNCHANGED for identical content");

  // Step 3: Re-ingest with mutated second paragraph
  const mutatedChunks = [
    "Our enterprise plan costs $49/month with full API access.",
    "The startup tier is now free for up to 5,000 requests per day.", // MUTATED
    "Enterprise customers receive 24/7 priority support.",
  ];

  const mutatedEmbeddings = await Promise.all(
    mutatedChunks.map((text) => generateEmbedding(text, TEST_USER_ID))
  );

  const { data: deltaResult2 } = await supabase.rpc("detect_workspace_source_delta", {
    new_embeddings: mutatedEmbeddings,
    target_workspace_id: TEST_WORKSPACE_ID,
    target_origin_uri: originUri,
    similarity_threshold: 0.98,
  });

  assert(deltaResult2 === "UPDATED", "Delta detection returns UPDATED for mutated content");

  // Step 4: Insert new rows and supersede old
  const newRows = mutatedChunks.map((content, i) => ({
    workspace_id: TEST_WORKSPACE_ID,
    user_id: TEST_USER_ID,
    source_type: "url",
    title: "Test Document",
    origin_uri: originUri,
    raw_text: content,
    content,
    embedding: mutatedEmbeddings[i],
    metadata: { test: "highlander", chunk_index: i, version: 2 },
  }));

  const { data: insertedNew } = await supabase
    .from("workspace_sources")
    .insert(newRows)
    .select("id");

  if (insertedNew) {
    await supabase.rpc("supersede_workspace_source", {
      target_workspace_id: TEST_WORKSPACE_ID,
      target_origin_uri: originUri,
    });
  }

  // Step 5: Verify Highlander Invariant
  const { data: activeRows } = await supabase
    .from("workspace_sources")
    .select("id, valid_from, valid_until")
    .eq("workspace_id", TEST_WORKSPACE_ID)
    .eq("origin_uri", originUri)
    .is("valid_until", null);

  assert(
    activeRows?.length === mutatedChunks.length,
    `Active rows (${activeRows?.length}) equals new chunk count (${mutatedChunks.length})`
  );

  // Step 6: Verify old rows are closed
  const { data: closedRows } = await supabase
    .from("workspace_sources")
    .select("id, valid_until")
    .eq("workspace_id", TEST_WORKSPACE_ID)
    .eq("origin_uri", originUri)
    .not("valid_until", "is", null);

  assert(
    closedRows?.length === originalChunks.length,
    `Closed rows (${closedRows?.length}) equals original chunk count (${originalChunks.length})`
  );

  // Step 7: Verify causal continuity (temporal adjacency)
  if (closedRows && activeRows && insertedOrig && insertedNew) {
    const oldChunk2 = insertedOrig[1]; // The mutated chunk
    const closedOld = closedRows.find((r) => r.id === oldChunk2.id);
    const newChunk2 = insertedNew[1];
    const activeNew = activeRows.find((r) => r.id === newChunk2.id);

    if (closedOld?.valid_until && activeNew?.valid_from) {
      const closedTime = new Date(closedOld.valid_until).getTime();
      const activeTime = new Date(activeNew.valid_from).getTime();
      assert(
        activeTime >= closedTime,
        `New chunk valid_from (${activeNew.valid_from}) >= old chunk valid_until (${closedOld.valid_until})`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: The 2-Hop CTE Limit (Context Window Protection)
// ═══════════════════════════════════════════════════════════════════════════════

async function test2HopCTELimit() {
  console.log("\n🔗 TEST 2: 2-Hop CTE Limit (Context Window Protection)");

  // Step 1: Create synthetic 10-node causal chain
  const nodeIds: string[] = [];
  const chainLength = 10; // A through J

  for (let i = 0; i < chainLength; i++) {
    const { data } = await supabase
      .from("knowledge_nodes")
      .insert({
        user_id: TEST_USER_ID,
        content: `Synthetic node ${String.fromCharCode(65 + i)}`, // A, B, C...
        canonical_name: `synthetic-node-${String.fromCharCode(65 + i).toLowerCase()}`,
        node_type: "concept",
        metadata: { test: "2hop", chain_position: i },
        embedding: null,
      })
      .select("id")
      .single();

    if (data) nodeIds.push(data.id);
  }

  assert(nodeIds.length === chainLength, `Created ${chainLength} synthetic nodes (A-J)`);

  // Step 2: Create edges: A->B, B->C, C->D, ..., I->J
  for (let i = 0; i < nodeIds.length - 1; i++) {
    await supabase.from("knowledge_edges").insert({
      source_node_id: nodeIds[i],
      target_node_id: nodeIds[i + 1],
      weight: 1.0,
      metadata: {
        relationship_type: i === nodeIds.length - 2 ? "DERIVED_FROM" : "CAUSES",
        test: "2hop",
        chain_position: i,
      },
    });
  }

  // Step 3: Create a workspace_source node that connects to node J (the deepest)
  const { data: sourceChunk } = await supabase
    .from("workspace_sources")
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      user_id: TEST_USER_ID,
      source_type: "note",
      title: "Deep Chain Source",
      origin_uri: "https://test.example.com/deep-chain",
      raw_text: "This connects to the end of a 10-node causal chain.",
      content: "This connects to the end of a 10-node causal chain.",
      embedding: await generateEmbedding("This connects to the end of a 10-node causal chain.", TEST_USER_ID),
      metadata: { test: "2hop" },
    })
    .select("id")
    .single();

  // Connect source chunk to node J
  if (sourceChunk) {
    await supabase.from("knowledge_edges").insert({
      source_node_id: sourceChunk.id,
      target_node_id: nodeIds[nodeIds.length - 1], // Node J
      weight: 1.0,
      metadata: { relationship_type: "DERIVED_FROM", test: "2hop" },
    });
  }

  // Step 4: Query lineage RPC for the source chunk
  if (sourceChunk) {
    const { data: lineageData, error } = await supabase.rpc(
      "match_workspace_sources_with_lineage_json",
      {
        query_embedding: await generateEmbedding("deep causal chain", TEST_USER_ID),
        target_workspace_id: TEST_WORKSPACE_ID,
        match_threshold: 0.1, // Low threshold to ensure match
        match_count: 5,
      }
    );

    assert(!error, "Lineage RPC returns without error");

    if (lineageData && Array.isArray(lineageData)) {
      const sourceEntry = lineageData.find(
        (entry: { source_id: string }) => entry.source_id === sourceChunk.id
      );

      assert(!!sourceEntry, "Source chunk found in lineage results");

      if (sourceEntry?.knowledge_nodes) {
        const nodes = sourceEntry.knowledge_nodes as Array<{ node_id: string; node_content: string }>;
        const nodeNames = nodes.map((n) => n.node_content);

        // Verify 2-hop limit: should see J and I, but NOT H or earlier
        const hasJ = nodeNames.some((n) => n.includes("Synthetic node J"));
        const hasI = nodeNames.some((n) => n.includes("Synthetic node I"));
        const hasH = nodeNames.some((n) => n.includes("Synthetic node H"));

        assert(hasJ, "Lineage includes node J (1-hop from source)");
        assert(hasI, "Lineage includes node I (2-hop from source)");
        assert(!hasH, "Lineage does NOT include node H (3-hop, beyond limit)");

        console.log(`     📊 Nodes returned: ${nodes.length} (J, I expected; H excluded)`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: The Critical Semantic Shift (Threshold Validation)
// ═══════════════════════════════════════════════════════════════════════════════

async function testCriticalSemanticShift() {
  console.log("\n🎯 TEST 3: Critical Semantic Shift (Threshold Validation)");

  const originUri = "https://test.example.com/semantic-shift";

  // Step 1: Ingest original chunk
  const originalText = "The enterprise SLA guarantees 99.9% uptime.";
  const originalEmbedding = await generateEmbedding(originalText, TEST_USER_ID);

  const { data: insertedOrig } = await supabase
    .from("workspace_sources")
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      user_id: TEST_USER_ID,
      source_type: "url",
      title: "SLA Document",
      origin_uri: originUri,
      raw_text: originalText,
      content: originalText,
      embedding: originalEmbedding,
      metadata: { test: "semantic-shift" },
    })
    .select("id")
    .single();

  // Step 2: Generate embedding for mutated text
  const mutatedText = "The enterprise SLA guarantees 99.0% uptime.";
  const mutatedEmbedding = await generateEmbedding(mutatedText, TEST_USER_ID);

  // Step 3: Run delta detection with mutated embedding
  const { data: verdict } = await supabase.rpc("detect_workspace_source_delta", {
    new_embeddings: [mutatedEmbedding],
    target_workspace_id: TEST_WORKSPACE_ID,
    target_origin_uri: originUri,
    similarity_threshold: 0.98,
  });

  assert(verdict === "UPDATED", `Verdict is UPDATED for 99.9% → 99.0% shift (got: ${verdict})`);

  // Step 4: Test whitespace/noise should be UNCHANGED
  const noisyText = "The enterprise SLA guarantees 99.9% uptime.   ";
  const noisyEmbedding = await generateEmbedding(noisyText, TEST_USER_ID);

  const { data: noisyVerdict } = await supabase.rpc("detect_workspace_source_delta", {
    new_embeddings: [noisyEmbedding],
    target_workspace_id: TEST_WORKSPACE_ID,
    target_origin_uri: originUri,
    similarity_threshold: 0.98,
  });

  assert(noisyVerdict === "UNCHANGED", `Verdict is UNCHANGED for whitespace noise (got: ${noisyVerdict})`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  LATTICE OS WORLD MODEL — INVARIANT TEST SUITE");
  console.log("═══════════════════════════════════════════════════════");

  await setupTestWorkspace();

  try {
    await testHighlanderInvariant();
    await test2HopCTELimit();
    await testCriticalSemanticShift();
  } catch (err) {
    console.error("\n💥 Test execution failed:", err);
    failed++;
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

main();
