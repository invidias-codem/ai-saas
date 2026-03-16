#!/usr/bin/env node
/**
 * Genie Context - Moltbook Social Integration
 * 
 * Handles agent registration and posting milestones to Moltbook.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const CREDENTIALS_PATH = '/Users/jroot/.config/moltbook/credentials.json';
const BASE_URL = 'https://www.moltbook.com/api/v1';

/**
 * Register the agent on Moltbook
 */
async function registerAgent(name, description) {
    console.log(`🦞 Registering agent "${name}" on Moltbook...`);

    const response = await fetch(`${BASE_URL}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
    });

    const data = await response.json();
    if (data.agent) {
        const configDir = path.dirname(CREDENTIALS_PATH);
        if (!existsSync(configDir)) {
            // mkdirSync handled externally or assumed
        }
        writeFileSync(CREDENTIALS_PATH, JSON.stringify(data.agent, null, 2));
        console.log('✅ Registered successfully!');
        console.log(`🔗 Claim URL: ${data.agent.claim_url}`);
        console.log(`🔑 API Key saved to: ${CREDENTIALS_PATH}`);
        return data.agent;
    } else {
        console.error('❌ Registration failed:', data.error);
    }
}

/**
 * Post a milestone to Moltbook
 */
async function postMilestone(content, title = "Engineering Update", submolt = "general") {
    if (!existsSync(CREDENTIALS_PATH)) {
        console.error('❌ No Moltbook credentials found. Please register first.');
        return;
    }

    const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    console.log(`📣 Posting to Moltbook (${submolt}): "${title}"...`);

    const response = await fetch(`${BASE_URL}/posts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${credentials.api_key}`
        },
        body: JSON.stringify({ submolt, title, content })
    });

    const data = await response.json();
    if (data.success) {
        console.log('✅ Milestone posted!');
    } else {
        console.error('❌ Post failed:', data.error);
    }
}

// Command router
const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

if (command === 'register') {
    registerAgent(arg1 || 'GenieBot', arg2 || 'AI Software Engineer for gen1e.xyz');
} else if (command === 'post') {
    postMilestone(arg1);
} else if (command === 'feed') {
    getFeed();
} else {
    console.log('Usage:');
    console.log('  node social.mjs register "GenieBot" "Description"');
    console.log('  node social.mjs post "Just deployed a new feature!"');
    console.log('  node social.mjs feed');
}

/**
 * Get the agent's feed
 */
async function getFeed() {
    if (!existsSync(CREDENTIALS_PATH)) {
        console.error('❌ No Moltbook credentials found. Please register first.');
        return;
    }

    const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
    console.log('🗞️  Fetching feed...');

    try {
        const response = await fetch(`${BASE_URL}/feed?limit=5`, {
            headers: { 'Authorization': `Bearer ${credentials.api_key}` }
        });

        const data = await response.json();
        if (data.success) {
            console.log('\n📱 --- My Feed ---\n');
            data.posts.forEach(post => {
                console.log(`@${post.author.name}: ${post.content}`);
                console.log(`❤️ ${post.likes}  💬 ${post.comments}\n`);
            });
        } else {
            console.error('❌ Failed to fetch feed:', data.error);
        }
    } catch (e) {
        console.error('❌ Network error:', e.message);
    }
}
