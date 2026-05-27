import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load envs manually because tsx might not load nextjs envs automatically in a simple script
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { getStorageClient, getStorageProjectId } from '../lib/gcp/storage';

async function main() {
  try {
    const storage = getStorageClient();
    const projectId = getStorageProjectId();
    const bucketName = `genie-uploads-${projectId}`;
    console.log(`Setting CORS for bucket: ${bucketName}`);

    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    
    const corsConfig = [
      {
        origin: ['*'], // In production, we can restrict this to the exact domain, but * is standard for signed URLs to avoid strict preflight blocks.
        method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable'],
        maxAgeSeconds: 3600
      }
    ];

    if (!exists) {
      console.log(`Bucket ${bucketName} does not exist. Creating it...`);
      await storage.createBucket(bucketName, {
        location: 'US', // Multi-region US
        cors: corsConfig
      });
      console.log('Bucket created with CORS.');
    } else {
      console.log(`Bucket exists. Updating CORS...`);
      await bucket.setCorsConfiguration(corsConfig);
      console.log('CORS updated successfully.');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
