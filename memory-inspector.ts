/**
 * Memory Inspector Utility
 * 
 * This utility helps you inspect and debug the memory system.
 * Run with: npx ts-node memory-inspector.ts [userId]
 * 
 * Example: npx ts-node memory-inspector.ts user_2abc123def
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(process.cwd(), 'keys/genie-ai-1ca85-a79dca93b5cd.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Service account JSON not found at:', serviceAccountPath);
  console.error('Expected to find Firebase credentials file');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'genie-ai-1ca85',
});

const db = admin.firestore();

interface UserMemory {
  id: string;
  userId: string;
  featureType: string;
  title: string;
  summary: string;
  tags?: string[];
  tokensUsed: number;
  createdAt: any;
  updatedAt: any;
  embedding?: number[];
}

async function inspectUserMemory(userId: string) {
  console.log('\n📊 Memory Inspector for User:', userId);
  console.log('═'.repeat(60));

  try {
    // Get user document
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      console.log('⚠️  User document not found in Firestore');
      console.log('This is normal for new users. Memory will be created on first interaction.');
      return;
    }

    console.log('\n📋 User Document:');
    console.log('  ID:', userDoc.id);
    const userData = userDoc.data();
    if (userData) {
      console.log('  Created:', userData.createdAt?.toDate?.() || userData.createdAt);
      console.log('  Subscription:', userData.subscription || 'N/A');
    }

    // Get memories collection
    const memoriesRef = userDocRef.collection('memories');
    const memoriesSnapshot = await memoriesRef.orderBy('createdAt', 'desc').get();

    console.log(`\n💾 Total Memories Stored: ${memoriesSnapshot.size}`);

    if (memoriesSnapshot.empty) {
      console.log('No memories found. This is normal for new users.');
      console.log('Memories are created after first interaction.');
      return;
    }

    // Display each memory
    console.log('\n📚 Memory Details:');
    console.log('─'.repeat(60));

    memoriesSnapshot.docs.forEach((doc, index) => {
      const memory = doc.data() as UserMemory;
      const createdDate = memory.createdAt?.toDate?.() || new Date(memory.createdAt);
      const timeSince = getTimeSince(createdDate);

      console.log(`\n[${index + 1}] ${memory.title}`);
      console.log(`    ID: ${doc.id}`);
      console.log(`    Feature: ${memory.featureType}`);
      console.log(`    Created: ${createdDate.toLocaleString()} (${timeSince} ago)`);
      console.log(`    Summary: ${memory.summary.substring(0, 80)}${memory.summary.length > 80 ? '...' : ''}`);
      console.log(`    Tags: ${memory.tags?.join(', ') || 'None'}`);
      console.log(`    Tokens: ${memory.tokensUsed}`);

      if (memory.embedding) {
        console.log(`    Embedding: ${memory.embedding.length}-dimensional vector`);
        console.log(`      Sample values: [${memory.embedding.slice(0, 3).map((v) => v.toFixed(4)).join(', ')}, ...]`);
      }
    });

    // Calculate statistics
    console.log('\n📈 Memory Statistics:');
    console.log('─'.repeat(60));

    const featureTypes = new Map<string, number>();
    let totalTokens = 0;
    let totalMessages = 0;

    memoriesSnapshot.forEach((doc) => {
      const memory = doc.data() as UserMemory;
      featureTypes.set(memory.featureType, (featureTypes.get(memory.featureType) || 0) + 1);
      totalTokens += memory.tokensUsed || 0;
      // totalMessages += memory.messages?.length || 0;
    });

    console.log(`Total Memories: ${memoriesSnapshot.size}`);
    console.log(`Total Tokens: ${totalTokens.toLocaleString()}`);
    console.log('\nBreakdown by Feature:');
    featureTypes.forEach((count, feature) => {
      console.log(`  ${feature}: ${count} memories`);
    });

    // Get earliest and latest
    const docs = memoriesSnapshot.docs;
    if (docs.length > 0) {
      const latest = docs[0].data() as UserMemory;
      const earliest = docs[docs.length - 1].data() as UserMemory;

      console.log('\nMemory Timeline:');
      console.log(`  Latest: ${latest.createdAt?.toDate?.().toLocaleString() || latest.createdAt}`);
      console.log(`  Earliest: ${earliest.createdAt?.toDate?.().toLocaleString() || earliest.createdAt}`);
      
      const daysDiff = Math.floor(
        (latest.createdAt?.toDate?.().getTime?.() - earliest.createdAt?.toDate?.().getTime?.()) / (1000 * 60 * 60 * 24)
      );
      console.log(`  Span: ${daysDiff} days`);
    }

    // Test retrieval (simulate)
    console.log('\n🔍 Memory Retrieval Simulation:');
    console.log('─'.repeat(60));
    console.log('Testing retrieval with different queries...\n');

    const testQueries = ['data science', 'python', 'machine learning', 'project'];

    for (const query of testQueries) {
      const lowerQuery = query.toLowerCase();
      let matches = 0;

      memoriesSnapshot.forEach((doc) => {
        const memory = doc.data() as UserMemory;
        if (
          memory.title.toLowerCase().includes(lowerQuery) ||
          memory.summary.toLowerCase().includes(lowerQuery) ||
          memory.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
        ) {
          matches++;
        }
      });

      console.log(`Query: "${query}" → ${matches} potential match${matches !== 1 ? 'es' : ''}`);
    }

    // Check Firestore storage
    console.log('\n💾 Storage Estimate:');
    console.log('─'.repeat(60));

    let totalBytes = 0;
    memoriesSnapshot.forEach((doc) => {
      const memory = doc.data() as UserMemory;
      // Rough estimation
      const docSize = JSON.stringify(memory).length;
      totalBytes += docSize;
    });

    const sizeInKB = (totalBytes / 1024).toFixed(2);
    const sizeInMB = (totalBytes / (1024 * 1024)).toFixed(2);

    console.log(`Total Data: ${sizeInKB} KB (${sizeInMB} MB)`);
    console.log(`Per Memory: ${(totalBytes / memoriesSnapshot.size / 1024).toFixed(2)} KB average`);

    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('─'.repeat(60));

    if (memoriesSnapshot.size === 0) {
      console.log('✓ User is new. Send a few messages to generate memories.');
    } else if (memoriesSnapshot.size < 3) {
      console.log('✓ Limited memory. Send more messages for better personalization.');
    } else {
      console.log('✓ Good amount of memory for personalization.');
    }

    if (totalTokens > 10000) {
      console.log('⚠️  High token usage. Consider trimming old memories.');
    }

    console.log('\n✅ Memory inspection complete!\n');

  } catch (error) {
    console.error('❌ Error inspecting memory:', error);
    process.exit(1);
  }
}

function getTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals: { [key: string]: number } = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [name, secondsInInterval] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInInterval);
    if (interval >= 1) {
      return `${interval} ${name}${interval !== 1 ? 's' : ''}`;
    }
  }

  return 'just now';
}

// Main execution
const userId = process.argv[2];

if (!userId) {
  console.log('\n🔍 Memory Inspector Utility\n');
  console.log('Usage: npx ts-node memory-inspector.ts <userId>\n');
  console.log('Examples:');
  console.log('  npx ts-node memory-inspector.ts user_2abc123def');
  console.log('  npx ts-node memory-inspector.ts test-user-12345\n');
  console.log('Note: Get your userId from:');
  console.log('  1. Browser DevTools Console: clerk.user?.id');
  console.log('  2. Firebase Console → Firestore → users collection');
  console.log('  3. Browser Network tab → Conversation API request\n');
  process.exit(0);
}

inspectUserMemory(userId)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
